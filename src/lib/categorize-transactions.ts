import OpenAI from "openai";

interface PlaidTransaction {
  id: string;
  transaction_id: string;
  amount: number;
  date: string;
  name: string;
  merchant_name: string | null;
  category: string | null;
  category_detailed: string | null;
}

export interface CategoryMatch {
  transaction_id: string;
  category_id: string;
  category_name: string;
  confidence: "high" | "medium" | "low";
  source: "learned" | "keyword" | "ai";
}

interface LearnedRule {
  merchant_pattern: string;
  category_id: string;
  category_name: string;
  times_used: number;
}

// Patterns that indicate a TRANSFER (money moving between your own accounts, not a real expense)
const TRANSFER_PATTERNS = [
  "cc payment", "payment thank you", "autopay",
  "cd deposit", "certificate of deposit",
  "transfer to", "transfer from", "online transfer", "wire transfer",
  "ach transfer", "zelle", "venmo transfer",
  "payment - thank you",
];

// Two-word combos — if BOTH words appear anywhere in the text, it's a transfer
const TRANSFER_COMBO_PATTERNS = [
  ["credit card", "payment"],
];

/**
 * Detect if a transaction is a transfer (not a real expense).
 */
export function isTransfer(txn: { name: string; merchant_name?: string | null; category_detailed?: string | null }): boolean {
  const searchText = `${txn.name} ${txn.merchant_name || ""} ${txn.category_detailed || ""}`.toLowerCase();
  if (TRANSFER_PATTERNS.some((pattern) => searchText.includes(pattern))) return true;
  if (TRANSFER_COMBO_PATTERNS.some((combo) => combo.every((part) => searchText.includes(part)))) return true;
  return false;
}

// Full category list — used by the AI and as fallback reference
// IMPORTANT: Every ID here MUST match a real row in the expense_categories table
const EXPENSE_CATEGORIES = [
  { id: "cat-ingredients", name: "Ingredients/Food Purchases (Costco, Walmart, grocery stores, food distributors)" },
  { id: "cat-beverages", name: "Beverage Purchases (drink ingredients, tea, juice supplies)" },
  { id: "cat-kombucha", name: "Kombucha (from local brewers)" },
  { id: "cat-immunity", name: "Immunity Shots (wellness shots from suppliers like Make Wellness)" },
  { id: "cat-supplies", name: "Supplies (cups, napkins, straws)" },
  { id: "cat-packaging", name: "Paper, Packaging & To-Go Containers (WebstaurantStore packaging)" },
  { id: "cat-smallwares", name: "Smallwares (utensils, sheet trays, pots — WebstaurantStore equipment)" },
  { id: "cat-rent", name: "Rent/Lease Payment (Clark Properties, landlord, property management)" },
  { id: "cat-electric", name: "Electric (FPL, power company)" },
  { id: "cat-gas", name: "Natural Gas" },
  { id: "cat-water", name: "Water & Sewage" },
  { id: "cat-internet", name: "Internet/Phone (AT&T, Comcast, Spectrum)" },
  { id: "cat-trash", name: "Trash Removal & Recycling (Waste Management)" },
  { id: "cat-cleaning", name: "Cleaning & Janitorial" },
  { id: "cat-pest-control", name: "Pest Control (Terminix, Orkin)" },
  { id: "cat-equipment-repair", name: "Kitchen Equipment Repairs" },
  { id: "cat-equipment-lease", name: "Equipment Lease/Financing (KMF, equipment loans)" },
  { id: "cat-insurance-general", name: "General Liability Insurance" },
  { id: "cat-cc-processing", name: "Credit Card Processing Fees (Square fees, Stripe fees)" },
  { id: "cat-pos-fees", name: "POS System Fees" },
  { id: "cat-software", name: "Software & Subscriptions (Canva, QuickBooks, apps)" },
  { id: "cat-digital-ads", name: "Digital Advertising (Facebook Ads, Google Ads, Instagram)" },
  { id: "cat-print-marketing", name: "Print Marketing & Flyers" },
  { id: "cat-marketing", name: "Marketing/Advertising (Spothopper, marketing platforms)" },
  { id: "cat-office", name: "Office Supplies & Postage (Amazon office supplies, printer ink)" },
  { id: "cat-bank-fees", name: "Bank Fees & Charges (overdraft, monthly fees)" },
  { id: "cat-loan", name: "Loan Payments" },
  { id: "cat-payroll", name: "Payroll/Wages (employee pay, checks to employees)" },
  { id: "cat-payroll-tax", name: "Payroll Taxes (FICA, FUTA, SUTA — employer payroll taxes only)" },
  { id: "cat-sales-tax", name: "Sales Tax Payments (Fla Dept Revenue, state sales tax remittance)" },
  { id: "cat-federal-tax", name: "Federal/Income Tax (IRS payments, quarterly estimated tax)" },
  { id: "cat-accounting", name: "Accounting & Bookkeeping (Focus 9, accounting software)" },
  { id: "cat-legal", name: "Legal Fees" },
  { id: "cat-business-license", name: "Business License (Dept of Agriculture, health permits, food permits)" },
  { id: "cat-travel", name: "Travel & Transportation (gas, Uber, tolls)" },
  { id: "cat-meals", name: "Meals & Entertainment (restaurants, fast food — owner/team eating out)" },
  { id: "cat-interest", name: "Interest Expense" },
  { id: "cat-decor", name: "Decor & Flowers" },
  { id: "cat-training", name: "Training & Recruiting (Barista Hustle, training subscriptions)" },
  { id: "cat-other", name: "Other/Miscellaneous (ONLY if truly unknown — avoid this)" },
];

export { EXPENSE_CATEGORIES };

/**
 * Normalize merchant name for matching (strip numbers, extra spaces, etc.)
 */
function normalizeMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(/[0-9#*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Clean transaction description for better matching.
 * Bank statements often add prefixes like "Recurring Payment authorized on 01/15"
 * or "Business to Business ACH Debit -" that hide the real merchant name.
 * Strip all of that noise so we can match the actual business.
 */
function cleanDescription(name: string): string {
  let cleaned = name;

  // Strip "Recurring Payment authorized on MM/DD" prefix
  cleaned = cleaned.replace(/^Recurring Payment authorized on \d{2}\/\d{2}\s*/i, "");

  // Strip "< Business to Business ACH Debit -" prefix
  cleaned = cleaned.replace(/^<?\s*Business to Business ACH Debit\s*-\s*/i, "");

  // Strip "Purchase authorized on MM/DD" prefix
  cleaned = cleaned.replace(/^Purchase authorized on \d{2}\/\d{2}\s*/i, "");

  // Strip card suffix like "S586002748813264 Card 6575"
  cleaned = cleaned.replace(/\s+S\d{15}\s+Card\s+\d{4}\s*$/i, "");
  // Also match P-prefixed auth codes
  cleaned = cleaned.replace(/\s+P\d{15}\s+Card\s+\d{4}\s*$/i, "");

  // Strip trailing state abbreviations with zip-like codes
  cleaned = cleaned.replace(/\s+[A-Z]{2}\s*$/, "");

  return cleaned.trim();
}

// ═══════════════════════════════════════════════════════════
// RESTAURANT INDUSTRY KEYWORD MATCHING
// ═══════════════════════════════════════════════════════════
//
// These patterns work for ANY restaurant, not just The Porch.
// They catch obvious categorizations BEFORE the AI even sees them.
// This prevents the AI from making dumb mistakes on well-known merchants.

interface KeywordRule {
  patterns: string[];     // If ANY of these appear in the cleaned description
  category_id: string;
  category_name: string;
  confidence: "high" | "medium";
}

const KEYWORD_RULES: KeywordRule[] = [
  // ── TAX PAYMENTS ──
  {
    patterns: ["irs", "usataxpymt", "irs usataxpymt"],
    category_id: "cat-federal-tax",
    category_name: "Federal/Income Tax",
    confidence: "high",
  },
  {
    patterns: ["dept of revenue", "dept revenue", "deptofrevenue", "fla dept revenue", "state tax payment"],
    category_id: "cat-sales-tax",
    category_name: "Sales Tax Payments",
    confidence: "high",
  },

  // ── RENT / PROPERTY ──
  {
    patterns: ["properties", "property management", "property mgmt", "realty", "real estate", "landlord"],
    category_id: "cat-rent",
    category_name: "Rent/Lease Payment",
    confidence: "high",
  },

  // ── UTILITIES ──
  {
    patterns: ["fpl ", "florida power", "duke energy", "power company", "electric company", "elec pymt"],
    category_id: "cat-electric",
    category_name: "Electric",
    confidence: "high",
  },
  {
    patterns: ["spectrum", "comcast", "xfinity", "at&t", "att ", "verizon", "t-mobile", "tmobile", "frontier comm"],
    category_id: "cat-internet",
    category_name: "Internet/Phone",
    confidence: "high",
  },
  {
    patterns: ["waste management", "waste pro", "republic services", "trash removal"],
    category_id: "cat-trash",
    category_name: "Trash Removal & Recycling",
    confidence: "high",
  },
  {
    patterns: ["natural gas", "peoples gas", "gas company", "florida city gas"],
    category_id: "cat-gas",
    category_name: "Natural Gas",
    confidence: "high",
  },
  {
    patterns: ["water utility", "water & sewer", "water department"],
    category_id: "cat-water",
    category_name: "Water & Sewage",
    confidence: "medium",
  },

  // ── INSURANCE ──
  {
    patterns: ["geico", "state farm", "allstate", "progressive", "liberty mutual", "farmers ins", "nationwide ins", "usaa ins"],
    category_id: "cat-insurance-general",
    category_name: "General Liability Insurance",
    confidence: "high",
  },

  // ── LEGAL ──
  {
    patterns: [" law ", "law firm", "attorney", "legal service", "leviton law", "law office", "law group", "law llc", "law pllc"],
    category_id: "cat-legal",
    category_name: "Legal Fees",
    confidence: "high",
  },

  // ── GOVERNMENT / LICENSING ──
  {
    patterns: ["dept of agri", "deptofagri", "department of agriculture", "dept agriculture"],
    category_id: "cat-business-license",
    category_name: "Business License",
    confidence: "high",
  },

  // ── PAYROLL ──
  {
    patterns: ["cashed check", "harland clarke check"],
    category_id: "cat-payroll",
    category_name: "Payroll/Wages",
    confidence: "high",
  },

  // ── PEST CONTROL ──
  {
    patterns: ["pest control", "terminix", "orkin", "imperial pest", "rentokil", "massey pest"],
    category_id: "cat-pest-control",
    category_name: "Pest Control",
    confidence: "high",
  },

  // ── BANK FEES ──
  {
    patterns: ["processing fee", "overdraft fee", "monthly maintenance fee", "service charge", "cash deposit processing"],
    category_id: "cat-bank-fees",
    category_name: "Bank Fees & Charges",
    confidence: "high",
  },

  // ── FOOD DISTRIBUTORS (works for any restaurant) ──
  {
    patterns: ["sysco", "us foods", "performance food", "gordon food", "ben e. keith"],
    category_id: "cat-ingredients",
    category_name: "Ingredients/Food Purchases",
    confidence: "high",
  },

  // ── GROCERY STORES (works for any restaurant) ──
  {
    patterns: ["costco whse", "walmart super", "walmart neigh", "wal-mart", "sam's club", "sams club", "publix", "aldi ", "whole foods", "trader joe", "kroger", "food lion", "winn-dixie", "winn dixie", "piggly wiggly"],
    category_id: "cat-ingredients",
    category_name: "Ingredients/Food Purchases",
    confidence: "high",
  },

  // ── RESTAURANT SUPPLY (works for any restaurant) ──
  {
    patterns: ["webstaurant", "restaurant depot", "chefs store", "chef's store"],
    category_id: "cat-supplies",
    category_name: "Supplies (cups, napkins, straws)",
    confidence: "high",
  },

  // ── EQUIPMENT FINANCING ──
  {
    patterns: ["kmfusa", "kmf ", "cit equipment", "equipment finance", "equipment lease"],
    category_id: "cat-equipment-lease",
    category_name: "Equipment Lease/Financing",
    confidence: "high",
  },

  // ── REAL SOFTWARE (these are definitely subscriptions, not food) ──
  {
    patterns: ["adobe", "spotify", "apple.com/bill", "google one", "openai", "simplisafe", "godaddy", "dnh*godaddy", "canva", "quickbooks", "intuit", "zoom.us", "dropbox", "microsoft", "slack"],
    category_id: "cat-software",
    category_name: "Software & Subscriptions",
    confidence: "high",
  },

  // ── GAS STATIONS → TRAVEL ──
  {
    patterns: ["wawa ", "racetrac", "shell oil", "chevron", "exxon", "mobil ", "bp ", "circle k", "7-eleven", "loves travel", "pilot travel", "marathon petrol", "speedway"],
    category_id: "cat-travel",
    category_name: "Travel & Transportation",
    confidence: "high",
  },
];

/**
 * Step 1.5: Keyword matching — catches obvious patterns before AI
 * Uses cleaned descriptions (with bank noise stripped) for accurate matching.
 * Works for ANY restaurant, not just The Porch.
 */
function keywordMatch(txn: PlaidTransaction): CategoryMatch | null {
  // Clean the description to strip bank noise like "Recurring Payment authorized on..."
  const rawText = `${txn.name} ${txn.merchant_name || ""}`;
  const cleanedText = cleanDescription(rawText).toLowerCase();
  const fullText = rawText.toLowerCase();

  // Check both the cleaned and full text (some patterns match better on one vs the other)
  for (const rule of KEYWORD_RULES) {
    for (const pattern of rule.patterns) {
      if (cleanedText.includes(pattern) || fullText.includes(pattern)) {
        return {
          transaction_id: txn.transaction_id,
          category_id: rule.category_id,
          category_name: rule.category_name,
          confidence: rule.confidence,
          source: "keyword",
        };
      }
    }
  }

  // Special case: plain "Check" with no other context = payroll (hand-written checks)
  const trimmedName = txn.name.trim();
  if (trimmedName === "Check" || trimmedName === "< Check") {
    return {
      transaction_id: txn.transaction_id,
      category_id: "cat-payroll",
      category_name: "Payroll/Wages",
      confidence: "medium",
      source: "keyword",
    };
  }

  return null;
}

/**
 * Step 1: Check learned rules — exact matches from previously approved transactions
 */
function learnedMatch(
  txn: PlaidTransaction,
  rules: LearnedRule[]
): CategoryMatch | null {
  const merchantName = normalizeMerchant(
    txn.merchant_name || txn.name || ""
  );
  if (!merchantName) return null;

  for (const rule of rules) {
    if (merchantName.includes(rule.merchant_pattern)) {
      return {
        transaction_id: txn.transaction_id,
        category_id: rule.category_id,
        category_name: rule.category_name,
        confidence: rule.times_used >= 3 ? "high" : "medium",
        source: "learned",
      };
    }
  }
  return null;
}

/**
 * ═══════════════════════════════════════════════════════════
 * THE AI BRAIN — Smart Business Analysis
 * ═══════════════════════════════════════════════════════════
 *
 * Sends merchants to the AI for categorization. But now only the
 * ones that weren't already caught by keyword rules — so the AI
 * only handles the tricky/ambiguous ones, not the obvious stuff.
 *
 * The AI prompt is also improved:
 * - Cleans merchant names before sending (strips bank noise)
 * - Stronger restaurant industry context
 * - Explicit anti-patterns (never put rent in tax, etc.)
 */
async function smartBusinessAnalysis(
  transactions: PlaidTransaction[],
  learnedRules: LearnedRule[]
): Promise<{ results: CategoryMatch[]; incomeIds: string[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || transactions.length === 0) return { results: [], incomeIds: [] };

  const openai = new OpenAI({ apiKey });

  // Group transactions by normalized merchant name so the AI sees
  // each merchant once (with counts and average amounts for context)
  const merchantGroups = new Map<string, {
    sampleName: string;
    cleanedName: string;
    transactionIds: string[];
    totalAmount: number;
    count: number;
  }>();

  for (const txn of transactions) {
    // Use CLEANED description for grouping (strips bank prefix noise)
    const rawName = txn.merchant_name || txn.name || "";
    const cleanedName = cleanDescription(rawName);
    const key = normalizeMerchant(cleanedName);
    if (!key || key.length < 3) continue;

    const existing = merchantGroups.get(key);
    if (existing) {
      existing.transactionIds.push(txn.transaction_id);
      existing.totalAmount += Math.abs(txn.amount);
      existing.count++;
    } else {
      merchantGroups.set(key, {
        sampleName: rawName,
        cleanedName,
        transactionIds: [txn.transaction_id],
        totalAmount: Math.abs(txn.amount),
        count: 1,
      });
    }
  }

  if (merchantGroups.size === 0) return { results: [], incomeIds: [] };

  // Build the merchant list for the AI — sorted by frequency
  const merchantEntries = Array.from(merchantGroups.entries())
    .sort((a, b) => b[1].count - a[1].count);

  // Process in batches of 80 merchants max to avoid token limits
  const BATCH_SIZE = 80;
  const allResults: CategoryMatch[] = [];
  const allIncomeIds: string[] = [];

  for (let batchStart = 0; batchStart < merchantEntries.length; batchStart += BATCH_SIZE) {
    const batch = merchantEntries.slice(batchStart, batchStart + BATCH_SIZE);
    const batchGroups = new Map(batch);

    if (batchStart > 0) {
      await new Promise((r) => setTimeout(r, 3000));
      console.log(`[smart-categorize] Processing batch ${Math.floor(batchStart / BATCH_SIZE) + 1}...`);
    }

    // Show the AI the CLEANED merchant names, not the noisy bank descriptions
    const merchantList = batch
      .map(([, data]) => {
        const avg = (data.totalAmount / data.count).toFixed(2);
        return `- "${data.cleanedName}" (${data.count} txns, avg $${avg})`;
      })
      .join("\n");

    const categoryList = EXPENSE_CATEGORIES.map(
      (c) => `${c.id}: ${c.name}`
    ).join("\n");

    // Include learned rules so the AI follows the owner's prior decisions
    const learnedContext =
      learnedRules.length > 0
        ? `\n\nIMPORTANT — The business owner has previously approved these categorizations. Follow these patterns for similar merchants:\n${learnedRules
            .slice(0, 50)
            .map((r) => `- "${r.merchant_pattern}" → ${r.category_id} (${r.category_name})`)
            .join("\n")}`
        : "";

    try {
      let response;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          response = await openai.chat.completions.create({
            model: "gpt-4o",
            temperature: 0,
            max_tokens: 16384,
            messages: [
              {
                role: "system",
                content: `You are an expert restaurant expense categorizer. You work for a restaurant financial management platform.

YOUR JOB: Categorize every merchant into the correct expense category for a restaurant business.

CRITICAL RULES — READ THESE CAREFULLY:

1. "Properties", "Realty", "Property Management" = RENT (cat-rent). NEVER put these in tax.
2. "IRS", "Usataxpymt" = Federal Tax (cat-federal-tax). NEVER put non-IRS items in federal tax.
3. "Dept of Revenue" = Sales Tax (cat-sales-tax). This is STATE tax, not federal.
4. "Dept of Agriculture", government permits = Business License (cat-business-license).
5. Restaurant supply stores (WebstaurantStore, Restaurant Depot) = Supplies or Packaging.
6. Grocery stores (Costco, Walmart, Publix, etc.) = Ingredients when purchased by a restaurant.
7. Insurance companies (Geico, State Farm, etc.) = Insurance (cat-insurance-general).
8. Spectrum, Comcast, AT&T = Internet/Phone (cat-internet). NOT software.
9. Law firms, attorneys = Legal Fees (cat-legal).
10. Plain "Check" or "Cashed Check" = Payroll (cat-payroll). Restaurants often pay staff by check.

ANTI-PATTERNS — NEVER DO THESE:
- NEVER categorize a property/realty company as tax
- NEVER categorize internet providers (Spectrum, Comcast) as software
- NEVER categorize restaurant supply stores as software
- NEVER categorize insurance companies as software
- NEVER put things in cat-other unless you truly have NO idea what the merchant is
- NEVER let the word "Recurring" bias you toward software — recurring payments can be for ANYTHING

INCOME SOURCES (mark as "isIncome": true):
- Square Inc (payment processor deposits)
- DoorDash, Uber Eats, Grubhub (delivery platform deposits)
- Any "deposit" or "purchase return" or refund
${learnedContext}

Available expense categories:
${categoryList}

Return a JSON array where each element is:
{ "merchant": "the merchant name", "category_id": "cat-xxx", "isIncome": false }

For income sources: { "merchant": "name", "category_id": null, "isIncome": true }

Return ONLY valid JSON array. No explanation, no markdown fences.`,
              },
              {
                role: "user",
                content: `Categorize these merchants for a restaurant business:\n\n${merchantList}`,
              },
            ],
          });
          break;
        } catch (err: unknown) {
          const isRateLimit = err instanceof Error && (err.message.includes("429") || err.message.includes("rate_limit"));
          if (isRateLimit && attempt < 2) {
            const waitSec = (attempt + 1) * 15;
            console.log(`[smart-categorize] Rate limited, waiting ${waitSec}s (attempt ${attempt + 2}/3)...`);
            await new Promise((r) => setTimeout(r, waitSec * 1000));
            continue;
          }
          throw err;
        }
      }
      if (!response) throw new Error("Failed after retries");

      const content = response.choices[0]?.message?.content || "[]";
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error("[smart-categorize] AI did not return valid JSON for batch");
        continue;
      }

      const aiRules = JSON.parse(jsonMatch[0]) as Array<{
        merchant: string;
        category_id: string | null;
        isIncome: boolean;
      }>;

      // Build a lookup from normalized AI merchant → rule
      const aiRuleMap = new Map<string, typeof aiRules[0]>();
      for (const rule of aiRules) {
        aiRuleMap.set(normalizeMerchant(rule.merchant), rule);
      }

      // Apply rules to transaction groups in this batch
      for (const [normalizedKey, group] of batchGroups) {
        let matchedRule = aiRuleMap.get(normalizedKey);

        // If no exact match, try partial matching (AI might have shortened the name)
        if (!matchedRule) {
          for (const [ruleKey, rule] of aiRuleMap) {
            if (normalizedKey.includes(ruleKey) || ruleKey.includes(normalizedKey)) {
              matchedRule = rule;
              break;
            }
          }
        }

        if (!matchedRule) continue;

        if (matchedRule.isIncome) {
          allIncomeIds.push(...group.transactionIds);
        } else if (matchedRule.category_id) {
          const categoryName =
            EXPENSE_CATEGORIES.find((c) => c.id === matchedRule!.category_id)?.name || "Other";
          for (const txnId of group.transactionIds) {
            allResults.push({
              transaction_id: txnId,
              category_id: matchedRule.category_id,
              category_name: categoryName,
              confidence: "high",
              source: "ai",
            });
          }
        }
      }

      console.log(`[smart-categorize] Batch: ${batchGroups.size} merchants → ${allResults.length} categorized so far`);

    } catch (error) {
      console.error("[smart-categorize] AI analysis error for batch:", error);
    }
  } // end batch loop

  console.log(`[smart-categorize] AI total: ${merchantEntries.length} merchants → ${allResults.length} categorized, ${allIncomeIds.length} income`);
  return { results: allResults, incomeIds: allIncomeIds };
}

/**
 * Main function: categorize transactions
 *
 * Three-layer approach for maximum accuracy:
 * 1. Detect and remove transfers (CC payments, bank transfers)
 * 2. Check learned rules (exact merchant matches from prior approvals)
 * 3. Keyword matching — restaurant industry patterns that catch obvious things
 *    like "IRS" = tax, "Properties" = rent, "Spectrum" = internet, etc.
 * 4. AI Brain — only handles the ambiguous merchants that keywords couldn't catch
 *
 * Returns category matches, transfer IDs, and income IDs (for sign correction)
 */
export async function categorizeTransactions(
  transactions: PlaidTransaction[],
  learnedRules: LearnedRule[] = []
): Promise<{ matches: CategoryMatch[]; transferIds: string[]; incomeIds: string[] }> {
  const results: CategoryMatch[] = [];
  const transferIds: string[] = [];

  // Only categorize expenses (positive amounts = money out)
  const expenses = transactions.filter((t) => t.amount > 0);

  // Step 0: Detect transfers and pull them out
  const realExpenses: PlaidTransaction[] = [];
  for (const txn of expenses) {
    if (isTransfer(txn)) {
      transferIds.push(txn.transaction_id);
    } else {
      realExpenses.push(txn);
    }
  }

  // Step 1: Check learned rules (exact merchant matches from prior approvals)
  const afterLearned: PlaidTransaction[] = [];
  for (const txn of realExpenses) {
    const match = learnedMatch(txn, learnedRules);
    if (match) {
      results.push(match);
    } else {
      afterLearned.push(txn);
    }
  }

  // Step 2: Keyword matching — restaurant industry patterns
  // This catches obvious things BEFORE the AI gets a chance to mess them up
  const needsAI: PlaidTransaction[] = [];
  for (const txn of afterLearned) {
    const match = keywordMatch(txn);
    if (match) {
      results.push(match);
    } else {
      needsAI.push(txn);
    }
  }

  console.log(`[categorize] ${realExpenses.length} expenses: ${results.length - afterLearned.length + realExpenses.length - afterLearned.length} learned, ${afterLearned.length - needsAI.length} keyword, ${needsAI.length} need AI`);

  // Step 3: Smart Business Analysis — the AI brain (only for what's left)
  if (needsAI.length > 0) {
    const { results: aiResults, incomeIds } = await smartBusinessAnalysis(needsAI, learnedRules);
    results.push(...aiResults);
    return { matches: results, transferIds, incomeIds };
  }

  return { matches: results, transferIds, incomeIds: [] };
}
