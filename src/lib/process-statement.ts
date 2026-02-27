import { getDb } from "@/lib/db";
import { ensurePlaidTables } from "@/lib/plaid";
import { extractStatementTransactions } from "@/lib/openai";
import { categorizeTransactions } from "@/lib/categorize-transactions";
import { v4 as uuid } from "uuid";

// Use require() to avoid pdf-parse's buggy dynamic import behavior
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

/**
 * Process a single queued statement: parse PDF → AI extraction → insert transactions
 */
export async function processStatement(statementId: string): Promise<void> {
  const sql = getDb();

  // Mark as processing
  await sql`UPDATE bank_statements SET status = 'processing' WHERE id = ${statementId}`;

  // Load the stored PDF
  const rows = await sql`SELECT pdf_data, file_name FROM bank_statements WHERE id = ${statementId}`;
  if (rows.length === 0) {
    throw new Error(`Statement ${statementId} not found`);
  }

  const { pdf_data, file_name } = rows[0];
  const buffer = Buffer.from(pdf_data, "base64");

  // Extract text from PDF
  let pdfData;
  try {
    pdfData = await pdfParse(buffer);
  } catch {
    await sql`
      UPDATE bank_statements SET status = 'error', error_message = 'Could not read the PDF file'
      WHERE id = ${statementId}
    `;
    console.error(`[process-statement] PDF parse failed for ${file_name}`);
    return;
  }

  const pdfText = pdfData.text || "";
  if (pdfText.trim().length < 100) {
    await sql`
      UPDATE bank_statements SET status = 'error', error_message = 'PDF does not contain readable text (may be a scanned image)'
      WHERE id = ${statementId}
    `;
    return;
  }

  // Send to AI for extraction
  let extracted;
  try {
    extracted = await extractStatementTransactions(pdfText);
  } catch (aiError) {
    await sql`
      UPDATE bank_statements SET status = 'error', error_message = 'AI could not read the statement'
      WHERE id = ${statementId}
    `;
    console.error(`[process-statement] AI extraction failed for ${file_name}:`, aiError);
    return;
  }

  // Insert ALL transactions — debits as positive (money out), credits as negative (money in)
  // This way DoorDash payments, refunds, etc. show correctly
  const allTransactions = extracted.transactions.filter((t) => t.amount > 0);

  // Known INCOME sources — these are always deposits (money coming IN).
  // The AI sometimes gets confused and marks them as "debit" instead of "credit",
  // so we force-correct them here regardless of what the AI says.
  const INCOME_PATTERNS = [
    "doordash",
    "square inc",
    "deposit made",
    "deposited or cashed",
    "purchase return",   // refunds = money back in
  ];

  let inserted = 0;
  for (let i = 0; i < allTransactions.length; i++) {
    const t = allTransactions[i];
    const txnId = `stmt-${statementId.slice(0, 8)}-${i}`;

    // Check if this is a known income source — override AI's type if needed
    const descLower = t.description.toLowerCase();
    const isKnownIncome = INCOME_PATTERNS.some((p) => descLower.includes(p));
    const effectiveType = isKnownIncome ? "credit" : t.type;

    // Debits (money out) = positive amount, Credits (money in) = negative amount
    const amount = effectiveType === "credit" ? -t.amount : t.amount;

    try {
      await sql`
        INSERT INTO plaid_transactions (
          id, plaid_account_id, transaction_id, amount, date, name, merchant_name,
          source, statement_id, review_status
        )
        VALUES (
          ${txnId}, ${null}, ${txnId}, ${amount}, ${t.date},
          ${t.description}, ${t.description},
          'statement', ${statementId}, 'pending'
        )
        ON CONFLICT (transaction_id) DO NOTHING
      `;
      inserted++;
    } catch (insertErr) {
      console.error(`[process-statement] Failed to insert txn ${i} for ${file_name}:`, insertErr);
    }
  }

  // Update statement record with results
  await sql`
    UPDATE bank_statements SET
      bank_name = ${extracted.bank_name},
      statement_date = ${extracted.period_end},
      period_start = ${extracted.period_start},
      period_end = ${extracted.period_end},
      transaction_count = ${inserted},
      status = 'completed'
    WHERE id = ${statementId}
  `;

  console.log(`[process-statement] ✓ ${file_name}: ${inserted} transactions extracted`);
}

/**
 * Process all queued statements one by one, then auto-categorize everything.
 * Uses the database itself as a lock — grabs one "queued" statement at a time
 * by atomically flipping it to "processing". This way, if a previous job died,
 * the stuck-detection logic rescues it and we pick it up on the next run.
 */
export async function processAllQueued(): Promise<void> {
  const sql = getDb();
  await ensurePlaidTables(sql);

  // Rescue stuck statements — anything "processing" for more than 2 minutes is stuck
  const stuck = await sql`
    UPDATE bank_statements SET status = 'queued'
    WHERE status = 'processing'
      AND created_at < NOW() - INTERVAL '2 minutes'
    RETURNING id, file_name
  `;
  if (stuck.length > 0) {
    console.log(`[process-statement] Rescued ${stuck.length} stuck statement(s)`);
  }

  // Find all queued statements
  const queued = await sql`
    SELECT id, file_name FROM bank_statements
    WHERE status = 'queued'
    ORDER BY created_at ASC
  `;

  if (queued.length === 0) {
    return;
  }

  console.log(`[process-statement] Processing ${queued.length} queued statement(s)...`);

  for (let i = 0; i < queued.length; i++) {
    const stmt = queued[i];

    // Wait 5 seconds between files to avoid hitting OpenAI rate limits
    if (i > 0) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    try {
      await processStatement(stmt.id);
    } catch (err) {
      console.error(`[process-statement] Unexpected error processing ${stmt.file_name}:`, err);
      await sql`
        UPDATE bank_statements SET status = 'error', error_message = 'Unexpected processing error'
        WHERE id = ${stmt.id}
      `;
    }
  }

  // Auto-categorize all pending transactions
  console.log("[process-statement] Running auto-categorization...");
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const transactions = await sql`
      SELECT * FROM plaid_transactions
      WHERE review_status = 'pending' AND amount > 0 AND pending = false
      ORDER BY date DESC
    `;

    if (transactions.length > 0) {
      const learnedRules = await sql`
        SELECT merchant_pattern, category_id, category_name, times_used
        FROM plaid_category_rules
        ORDER BY times_used DESC
      `;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { matches, transferIds, incomeIds } = await categorizeTransactions(transactions as any, learnedRules as any);

      // Mark transfers
      for (const txnId of transferIds) {
        await sql`UPDATE plaid_transactions SET review_status = 'transfer' WHERE transaction_id = ${txnId}`;
      }

      // Fix income — the AI brain identified these as income sources
      // (e.g. DoorDash, Square deposits). Flip their amounts to negative (money IN)
      // and mark them so they don't show up in expense review.
      if (incomeIds.length > 0) {
        for (const txnId of incomeIds) {
          await sql`
            UPDATE plaid_transactions SET
              amount = -ABS(amount),
              review_status = 'income'
            WHERE transaction_id = ${txnId} AND amount > 0
          `;
        }
        console.log(`[process-statement] ✓ AI detected ${incomeIds.length} income transactions — flipped to negative`);
      }

      // Save category suggestions
      for (const match of matches) {
        await sql`
          UPDATE plaid_transactions SET
            suggested_category_id = ${match.category_id},
            auto_categorized = true,
            review_status = 'needs_review'
          WHERE transaction_id = ${match.transaction_id}
        `;
      }

      // SELF-LEARNING: Save AI categorizations as rules for next time
      // Group matches by merchant → category, then upsert into plaid_category_rules
      const ruleMap = new Map<string, { category_id: string; category_name: string; count: number }>();
      for (const match of matches) {
        if (match.source !== "ai") continue; // Only learn from AI decisions (not existing rules)
        const txn = transactions.find((t: Record<string, string>) => t.transaction_id === match.transaction_id);
        if (!txn) continue;
        const pattern = (txn.merchant_name || txn.name || "")
          .toLowerCase().replace(/[0-9#*]+/g, "").replace(/\s+/g, " ").trim();
        if (pattern.length < 3) continue;
        // Use first 30 chars as the pattern (enough to match, not too specific)
        const shortPattern = pattern.slice(0, 30).trim();
        const key = `${shortPattern}::${match.category_id}`;
        const existing = ruleMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          ruleMap.set(key, { category_id: match.category_id, category_name: match.category_name, count: 1 });
        }
      }
      // Save learned rules
      let rulesLearned = 0;
      for (const [key, rule] of ruleMap) {
        const pattern = key.split("::")[0];
        try {
          await sql`
            INSERT INTO plaid_category_rules (id, merchant_pattern, category_id, category_name, times_used)
            VALUES (${`rule-${Date.now()}-${rulesLearned}`}, ${pattern}, ${rule.category_id}, ${rule.category_name}, ${rule.count})
            ON CONFLICT (merchant_pattern, category_id) DO UPDATE SET
              times_used = plaid_category_rules.times_used + ${rule.count},
              updated_at = NOW()
          `;
          rulesLearned++;
        } catch { /* ignore duplicate rule errors */ }
      }
      if (rulesLearned > 0) {
        console.log(`[process-statement] ✓ Self-learning: saved ${rulesLearned} new categorization rules`);
      }

      console.log(`[process-statement] ✓ Categorized ${matches.length} transactions, ${transferIds.length} transfers detected`);
    } else {
      console.log("[process-statement] No pending transactions to categorize");
    }
  } catch (catError) {
    console.error("[process-statement] Categorization error:", catError);
    // Don't fail the whole batch just because categorization failed —
    // the statements are already processed, user can categorize manually
  }

  console.log("[process-statement] All done!");
}

/**
 * Quick helper used by the status endpoint to generate a processing summary
 */
export interface ProcessingSummary {
  total: number;
  queued: number;
  processing: number;
  completed: number;
  errors: number;
  total_transactions: number;
  categorized: boolean;
}

export async function getProcessingSummary(): Promise<ProcessingSummary> {
  const sql = getDb();

  // Get statements from the last 24 hours
  const stats = await sql`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE status = 'queued') as queued,
      COUNT(*) FILTER (WHERE status = 'processing') as processing,
      COUNT(*) FILTER (WHERE status = 'completed') as completed,
      COUNT(*) FILTER (WHERE status = 'error') as errors,
      COALESCE(SUM(transaction_count) FILTER (WHERE status = 'completed'), 0) as total_transactions
    FROM bank_statements
    WHERE created_at > NOW() - INTERVAL '24 hours'
  `;

  const row = stats[0];
  const total = Number(row.total);
  const queued = Number(row.queued);
  const processing = Number(row.processing);
  const completed = Number(row.completed);

  // Check if categorization has run (are there needs_review transactions from recent statements?)
  let categorized = false;
  if (completed > 0 && queued === 0 && processing === 0) {
    const catCheck = await sql`
      SELECT COUNT(*) as cnt FROM plaid_transactions
      WHERE source = 'statement'
        AND review_status IN ('needs_review', 'approved', 'transfer')
        AND created_at > NOW() - INTERVAL '24 hours'
    `;
    categorized = Number(catCheck[0].cnt) > 0;
  }

  return {
    total,
    queued,
    processing,
    completed,
    errors: Number(row.errors),
    total_transactions: Number(row.total_transactions),
    categorized,
  };
}
