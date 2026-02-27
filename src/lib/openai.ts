import OpenAI from "openai";

// Lazy initialization - only create client when needed (not at build time)
let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

/**
 * Wrapper for OpenAI calls that handles rate limits gracefully.
 * Retries up to 3 times with increasing wait times when rate-limited (429 errors).
 */
export async function callOpenAIWithRetry(
  fn: (openai: OpenAI) => Promise<OpenAI.Chat.Completions.ChatCompletion>
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const openai = getOpenAI();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn(openai);
    } catch (err: unknown) {
      const isRateLimit =
        err instanceof Error &&
        (err.message.includes("429") || err.message.includes("rate_limit"));
      if (isRateLimit && attempt < 2) {
        const waitSec = (attempt + 1) * 15; // 15s, then 30s
        console.log(
          `[openai] Rate limited, waiting ${waitSec}s before retry (attempt ${attempt + 2}/3)...`
        );
        await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to get AI response after retries");
}

export interface ExtractedItem {
  raw_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  item_size: number | null;
  item_size_unit: string | null;
}

export interface ExtractedReceipt {
  supplier: string;
  receipt_date: string;
  subtotal: number;
  tax: number;
  total: number;
  items: ExtractedItem[];
}

/**
 * Sends one or more receipt images to GPT-4o Vision and gets back structured data
 * about every item on the receipt. Supports multiple photos of the same receipt
 * (e.g. top half, bottom half) — the AI combines them into one result.
 */
/**
 * Use Google Cloud Vision to read text from a receipt image.
 * This is a dedicated OCR service — much more accurate than GPT-4o for reading text.
 */
async function ocrWithGoogleVision(imageBase64: string): Promise<string> {
  const apiKey = process.env.GOOGLE_VISION_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_VISION_API_KEY not configured");
  }

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            image: { content: imageBase64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          },
        ],
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || "Google Vision API error");
  }

  return data.responses?.[0]?.textAnnotations?.[0]?.description || "";
}

/**
 * Sends one or more receipt images through Google Cloud Vision (for accurate text reading)
 * then GPT-4o (for understanding the text and structuring it into items/prices).
 * Each tool does what it's best at.
 */
export async function extractReceiptData(
  imageBase64: string | string[],
  mimeType: string | string[]
): Promise<ExtractedReceipt> {
  const openai = getOpenAI();

  // Normalize to arrays
  const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];

  // Step 1: Read the text from each image using Google Cloud Vision
  const ocrTexts: string[] = [];
  for (const img of images) {
    const text = await ocrWithGoogleVision(img);
    ocrTexts.push(text);
  }

  // Combine all OCR text
  const combinedText = images.length > 1
    ? ocrTexts.map((t, i) => `--- Photo ${i + 1} of ${images.length} ---\n${t}`).join("\n\n")
    : ocrTexts[0];

  const multiImageNote = images.length > 1
    ? `\nIMPORTANT: This text comes from ${images.length} photos of the SAME receipt that overlap. Combine all items into ONE list — do NOT duplicate items that appear in multiple photos.`
    : "";

  // Log the raw OCR text for debugging
  console.log("[receipt-ocr] Raw OCR text:", combinedText);

  const systemPrompt = `You are an expert receipt parser. You will receive the exact text from a receipt (read by OCR). Parse it into structured JSON.

CRITICAL: The OCR text is the ground truth. You must account for EVERY item line. Do NOT skip any.

Return this exact JSON structure:
{
  "supplier": "store name",
  "receipt_date": "YYYY-MM-DD",
  "subtotal": number,
  "tax": number,
  "total": number,
  "items": [
    {
      "raw_name": "item name as it appears",
      "quantity": number (how many of this exact item — count repeated lines with the same name),
      "unit_price": number (price for one),
      "total_price": number (total charged for ALL of this item),
      "item_size": number or null (the size/weight of ONE package — e.g. 2 for "2LB", 32 for "32OZ", 128 for a gallon),
      "item_size_unit": string or null (the unit for item_size — e.g. "lb", "oz", "fl oz", "ct", "gal", "each")
    }
  ]
}

Rules:
- Include EVERY purchasable item line — do NOT skip any
- If the same item appears on multiple lines (e.g. "Avocados 0.49" appears 6 times), GROUP them into ONE item with quantity=6, unit_price=0.49, total_price=2.94
- For weight-based items (e.g. bananas sold by the lb), each line is a different weight so keep them SEPARATE — do NOT group weight-based items
- Each item line typically has: item name on the left, price on the right
- The price at the END of each item line is the amount charged — copy it EXACTLY
- For "2 @ $3.99" lines: quantity=2, unit_price=3.99, total_price=7.98
- For weight-based items like "1.47 lb @ $0.59/lb": total_price is the final dollar amount on that line
- Letters like F, T, N, X after prices are tax codes — ignore them
- Skip non-item lines: SUBTOTAL, TAX, TOTAL, CHANGE, CASH, CARD, BALANCE, SAVINGS, LOYALTY, MEMBER, THANK YOU

PACKAGE SIZE EXTRACTION (very important):
- Look for size/weight info in the item name. Receipts often abbreviate: "GV STRWBRRY 2LB" means 2 lb strawberries, "WHLMILK 1GAL" means 1 gallon milk, "HVY CRM 32OZ" means 32 oz heavy cream
- Common patterns: "2LB", "32OZ", "16OZ", "1GAL", "64FL OZ", "5LB", "10CT", "100CT", "1000CT"
- If item_size is found, also set item_size_unit (normalize to: "lb", "oz", "fl oz", "gal", "ct", "each")
- For weight-based items sold by the pound (e.g. "1.47 lb @ $0.59/lb"), set item_size to the weight (1.47) and item_size_unit to "lb"
- If no size info is visible in the text, set both to null — do NOT guess
- This helps track inventory correctly even when a store substitutes a different package size than expected

- IMPORTANT VERIFICATION: After building your items list, add up all total_prices. This sum MUST equal the subtotal on the receipt. If it doesn't, you missed items or got a price wrong — go back and fix it before responding.
- Return ONLY valid JSON, no markdown${multiImageNote}`;

  // Step 2: First pass — parse the OCR text
  // Using gpt-4o-mini since Google Vision already did the hard work (reading text).
  // GPT just needs to organize text into JSON — the cheap model handles this fine.
  const response = await callOpenAIWithRetry((ai) =>
    ai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is the exact text from a receipt (read by OCR). Parse it into the JSON structure:\n\n${combinedText}` },
      ],
      max_tokens: 8192,
      temperature: 0,
    })
  );

  const content = response.choices[0]?.message?.content || "{}";
  const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed = JSON.parse(cleaned) as ExtractedReceipt;

  // Ensure all items have required fields
  parsed.items = (parsed.items || []).map((item) => ({
    raw_name: item.raw_name || "Unknown Item",
    quantity: item.quantity || 1,
    unit_price: item.unit_price || 0,
    total_price: item.total_price || item.unit_price || 0,
    item_size: item.item_size || null,
    item_size_unit: item.item_size_unit || null,
  }));

  // Step 3: VERIFICATION — check if items add up to the subtotal
  const itemsSum = parsed.items.reduce((s, i) => s + i.total_price, 0);
  const receiptSubtotal = parsed.subtotal || (parsed.total - (parsed.tax || 0));
  const discrepancy = Math.abs(itemsSum - receiptSubtotal);

  console.log(`[receipt-verify] Items sum: $${itemsSum.toFixed(2)}, Subtotal: $${receiptSubtotal.toFixed(2)}, Discrepancy: $${discrepancy.toFixed(2)}`);

  // If discrepancy is more than $1.00, ask GPT to re-check
  if (discrepancy > 1.00) {
    console.log(`[receipt-verify] Discrepancy too large ($${discrepancy.toFixed(2)}), asking AI to re-check...`);

    const retryResponse = await callOpenAIWithRetry((ai) =>
      ai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Here is the exact text from a receipt (read by OCR). Parse it into the JSON structure:\n\n${combinedText}` },
          { role: "assistant", content: content },
          { role: "user", content: `PROBLEM: Your items add up to $${itemsSum.toFixed(2)} but the receipt subtotal is $${receiptSubtotal.toFixed(2)}. That's a $${discrepancy.toFixed(2)} discrepancy. You missed some items or got prices wrong.

Please re-read the OCR text carefully and return the COMPLETE corrected JSON. Make sure:
1. Count EVERY item line in the text — you missed some
2. Group identical items (same name, same price) by increasing the quantity
3. The sum of all total_prices must equal $${receiptSubtotal.toFixed(2)}
4. Return ONLY the corrected JSON, no explanation.` },
        ],
        max_tokens: 8192,
        temperature: 0,
      })
    );

    const retryContent = retryResponse.choices[0]?.message?.content || "";
    const retryCleaned = retryContent.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

    try {
      const retryParsed = JSON.parse(retryCleaned) as ExtractedReceipt;
      retryParsed.items = (retryParsed.items || []).map((item) => ({
        raw_name: item.raw_name || "Unknown Item",
        quantity: item.quantity || 1,
        unit_price: item.unit_price || 0,
        total_price: item.total_price || item.unit_price || 0,
        item_size: item.item_size || null,
        item_size_unit: item.item_size_unit || null,
      }));

      const retrySum = retryParsed.items.reduce((s, i) => s + i.total_price, 0);
      const retryDiscrepancy = Math.abs(retrySum - receiptSubtotal);
      console.log(`[receipt-verify] Retry sum: $${retrySum.toFixed(2)}, Discrepancy: $${retryDiscrepancy.toFixed(2)}`);

      // Use retry result if it's better (closer to subtotal)
      if (retryDiscrepancy < discrepancy) {
        parsed = retryParsed;
        console.log("[receipt-verify] Retry was better, using corrected result");
      }
    } catch {
      console.log("[receipt-verify] Retry parse failed, keeping original");
    }
  }

  // Attach raw OCR text for debugging
  (parsed as ExtractedReceipt & { _rawOcrText?: string })._rawOcrText = combinedText;

  return parsed;
}

/* ─── Bank Statement Extraction ─── */

export interface ExtractedStatementTransaction {
  date: string;
  description: string;
  amount: number;
  type: "debit" | "credit";
}

export interface ExtractedStatement {
  bank_name: string;
  account_type: string;
  period_start: string;
  period_end: string;
  transactions: ExtractedStatementTransaction[];
}

/**
 * Sends the text content of a bank statement PDF to GPT-4o-mini
 * and gets back structured transaction data.
 */
export async function extractStatementTransactions(
  pdfText: string
): Promise<ExtractedStatement> {
  const openai = getOpenAI();

  const messages = [
    {
      role: "system" as const,
      content: `You are a bank statement parser. Extract every transaction from the bank statement text.
Return a JSON object with this exact structure:
{
  "bank_name": "name of the bank",
  "account_type": "checking or savings or credit card",
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "description": "merchant or description text",
      "amount": number (always positive),
      "type": "debit" or "credit"
    }
  ]
}

Rules:
- Extract EVERY transaction line — purchases, payments, fees, deposits, etc.
- "debit" means money going OUT (purchases, withdrawals, fees, payments)
- "credit" means money coming IN (deposits, refunds, interest)
- amount must always be a positive number — the type field indicates direction
- Use YYYY-MM-DD format for all dates. If the year is not on every line, infer it from the statement period.
- Keep the description as close to the original text as possible
- If you cannot determine bank_name, use "Unknown Bank"
- If dates for period_start or period_end are unclear, use the earliest and latest transaction dates
- Return ONLY valid JSON, no markdown or explanation`,
    },
    {
      role: "user" as const,
      content: `Extract all transactions from this bank statement:\n\n${pdfText}`,
    },
  ];

  // Use the shared retry wrapper for rate limit handling
  const response = await callOpenAIWithRetry((ai) =>
    ai.chat.completions.create({
      model: "gpt-4o",
      messages,
      max_tokens: 8192,
      temperature: 0.1,
    })
  );

  const content = response.choices[0]?.message?.content || "{}";

  // Strip markdown code fences if present
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned) as ExtractedStatement;

  // Ensure all transactions have required fields
  parsed.transactions = (parsed.transactions || []).map((t) => ({
    date: t.date || "",
    description: t.description || "Unknown",
    amount: Math.abs(t.amount || 0),
    type: t.type === "credit" ? "credit" : "debit",
  }));

  parsed.bank_name = parsed.bank_name || "Unknown Bank";
  parsed.account_type = parsed.account_type || "checking";
  parsed.period_start = parsed.period_start || "";
  parsed.period_end = parsed.period_end || "";

  return parsed;
}
