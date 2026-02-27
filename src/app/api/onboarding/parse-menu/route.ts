import { NextResponse } from "next/server";
import { callOpenAIWithRetry } from "@/lib/openai";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST — parse a menu image or PDF and extract item names + prices.
 * Accepts images (jpg, png, etc.) and PDFs.
 * Uses Google Vision for OCR on images, pdf-parse for PDFs, then GPT-4o for structuring.
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    let combinedText = "";

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      if (file.type === "application/pdf" || file.name?.toLowerCase().endsWith(".pdf")) {
        // PDF — extract text
        const pdfParse = (await import("pdf-parse")).default;
        const pdfData = await pdfParse(buffer);
        combinedText += pdfData.text + "\n\n";
      } else {
        // Image — use Google Vision OCR
        const base64 = buffer.toString("base64");
        const apiKey = process.env.GOOGLE_VISION_API_KEY;

        if (!apiKey) {
          return NextResponse.json({ error: "Google Vision API not configured" }, { status: 500 });
        }

        const visionRes = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requests: [{
                image: { content: base64 },
                features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              }],
            }),
          }
        );

        const visionData = await visionRes.json();
        const ocrText = visionData.responses?.[0]?.textAnnotations?.[0]?.description || "";
        combinedText += ocrText + "\n\n";
      }
    }

    if (!combinedText.trim()) {
      return NextResponse.json({ error: "Could not read any text from the file" }, { status: 400 });
    }

    // Use GPT-4o to structure the menu text into items
    const response = await callOpenAIWithRetry((ai) =>
      ai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a menu parser. Extract menu items with their names and selling prices from the text.

Return a JSON object:
{
  "items": [
    { "name": "Item Name", "selling_price": 12.99 },
    ...
  ]
}

Rules:
- Include EVERY food/drink item you can find
- selling_price should be a number (no $ sign)
- If an item has multiple sizes (S/M/L), use the most common or medium price
- Skip section headers, descriptions, and modifiers (just get the item name and price)
- If you can't determine the price for an item, set selling_price to 0
- Return ONLY valid JSON, no markdown`,
          },
          {
            role: "user",
            content: `Extract menu items and prices from this text:\n\n${combinedText}`,
          },
        ],
        max_tokens: 4096,
        temperature: 0,
      })
    );

    const content = response.choices[0]?.message?.content || "{}";
    const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    // Ensure items have valid data
    const items = (parsed.items || []).map((item: any) => ({
      name: item.name || "Unknown Item",
      selling_price: Number(item.selling_price) || 0,
    }));

    return NextResponse.json({ items, raw_text_length: combinedText.length });
  } catch (error: any) {
    console.error("Error parsing menu:", error);
    return NextResponse.json(
      { error: error.message || "Failed to parse menu" },
      { status: 500 }
    );
  }
}
