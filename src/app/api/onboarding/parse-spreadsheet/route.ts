import { NextResponse } from "next/server";
import { callOpenAIWithRetry } from "@/lib/openai";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST — parse a spreadsheet (CSV, Excel, or PDF) and extract ingredient/cost data.
 * Reads the file, converts to text, then uses GPT-4o to pull structured ingredient info.
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

      const fileName = file.name?.toLowerCase() || "";
      const fileType = file.type || "";

      if (fileType === "application/pdf" || fileName.endsWith(".pdf")) {
        // PDF
        const pdfParse = (await import("pdf-parse")).default;
        const pdfData = await pdfParse(buffer);
        combinedText += pdfData.text + "\n\n";
      } else if (fileName.endsWith(".csv") || fileType === "text/csv") {
        // CSV — just read as text
        combinedText += buffer.toString("utf-8") + "\n\n";
      } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
        // Excel — use a simple row-by-row text extraction
        // We'll send the raw content description to GPT; for .xlsx we can read with a basic parser
        try {
          // Dynamic import of xlsx library if available; otherwise fall back to raw text
          const XLSX = await import("xlsx");
          const workbook = XLSX.read(buffer, { type: "buffer" });
          for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const csv = XLSX.utils.sheet_to_csv(sheet);
            combinedText += `Sheet: ${sheetName}\n${csv}\n\n`;
          }
        } catch {
          // If xlsx isn't installed, read as raw text (won't be perfect but GPT can try)
          combinedText += `[Excel file: ${file.name} — could not parse directly. Raw data below.]\n`;
          combinedText += buffer.toString("utf-8").substring(0, 5000) + "\n\n";
        }
      } else {
        // Unknown format — try reading as text
        combinedText += buffer.toString("utf-8") + "\n\n";
      }
    }

    if (!combinedText.trim()) {
      return NextResponse.json({ error: "Could not read any data from the file" }, { status: 400 });
    }

    // Use GPT-4o to extract ingredient/cost data
    const response = await callOpenAIWithRetry((ai) =>
      ai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are a cost data parser for restaurants. Extract ingredient and supply cost information from spreadsheet/financial data.

Return a JSON object:
{
  "ingredients": [
    {
      "name": "Item Name",
      "package_size": 32,
      "package_unit": "oz",
      "package_price": 4.99,
      "supplier": "Store Name",
      "source": "spreadsheet"
    },
    ...
  ]
}

Rules:
- Extract every ingredient or supply item you can find with its cost
- package_size and package_unit: look for weight/volume info (e.g. "32oz", "5lb", "1gal")
- If no package size info is available, set package_size to null and package_unit to ""
- package_price: the cost per package/unit
- supplier: if a store/supplier name is visible, include it; otherwise use ""
- source should always be "spreadsheet"
- If the data includes monthly totals or revenue, skip those — we only want individual item costs
- Return ONLY valid JSON, no markdown`,
          },
          {
            role: "user",
            content: `Extract ingredient and cost data from this spreadsheet/document:\n\n${combinedText.substring(0, 15000)}`,
          },
        ],
        max_tokens: 8192,
        temperature: 0,
      })
    );

    const content = response.choices[0]?.message?.content || "{}";
    const cleaned = content.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    const ingredients = (parsed.ingredients || []).map((item: any) => ({
      name: item.name || "Unknown",
      package_size: item.package_size || "",
      package_unit: item.package_unit || "",
      package_price: Number(item.package_price) || "",
      supplier: item.supplier || "",
      source: "spreadsheet",
    }));

    return NextResponse.json({ ingredients });
  } catch (error: any) {
    console.error("Error parsing spreadsheet:", error);
    return NextResponse.json(
      { error: error.message || "Failed to parse file" },
      { status: 500 }
    );
  }
}
