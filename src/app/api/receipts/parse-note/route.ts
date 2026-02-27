import { NextRequest, NextResponse } from "next/server";
import { callOpenAIWithRetry } from "@/lib/openai";

// POST - Use AI to understand what the user typed about a receipt item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { note, raw_name, quantity, unit_price, total_price } = body as {
      note: string;
      raw_name: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    };

    if (!note || !note.trim()) {
      return NextResponse.json({ units_per_pack: null, explanation: null });
    }

    const response = await callOpenAIWithRetry((ai) =>
      ai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You help interpret notes about grocery purchases. The user bought an item and is telling you details about the packaging.

Your job: figure out how many individual units are inside ONE package/SKU from the receipt.

Examples:
- "2 loaves per pack" → units_per_pack: 2 (each pack has 2 loaves)
- "it's a 2-pack" → units_per_pack: 2
- "24 count" → units_per_pack: 24
- "6 pack of cans" → units_per_pack: 6
- "extra large loaf" → units_per_pack: 1 (it's just 1 big loaf)
- "bought 3 of them" → units_per_pack: 1 (they bought 3 packs, but each pack is 1 unit — the receipt already tracks the 3)
- "12 rolls total and I bought 2 packs" → units_per_pack: 6 (12 rolls / 2 packs)
- "big bag" → units_per_pack: 1
- "twin pack" → units_per_pack: 2
- "triple pack" → units_per_pack: 3

Return ONLY valid JSON:
{
  "units_per_pack": number or null,
  "explanation": "brief explanation in plain English"
}

If you can't determine a number, return units_per_pack: null.`,
          },
          {
            role: "user",
            content: `Receipt item: "${raw_name}"
Quantity on receipt: ${quantity}
Unit price: $${unit_price?.toFixed(2) || "0.00"}
Total charged: $${total_price?.toFixed(2) || "0.00"}

User's note: "${note}"

What's the units_per_pack?`,
          },
        ],
        max_tokens: 200,
        temperature: 0,
      })
    );

    const content = response.choices[0]?.message?.content || "{}";
    const cleaned = content
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(cleaned);

    return NextResponse.json({
      units_per_pack: parsed.units_per_pack || null,
      explanation: parsed.explanation || null,
    });
  } catch (error: unknown) {
    console.error("Error parsing note:", error);
    return NextResponse.json(
      { units_per_pack: null, explanation: null, error: "Failed to parse note" },
      { status: 500 }
    );
  }
}
