import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { extractReceiptData } from "@/lib/openai";
import { v4 as uuid } from "uuid";

// POST - upload one or more receipt images, run AI extraction, save to database
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    // Support both single "image" field and multiple "images" fields
    const singleFile = formData.get("image") as File | null;
    const multiFiles = formData.getAll("images") as File[];

    const files: File[] = multiFiles.length > 0
      ? multiFiles
      : singleFile
      ? [singleFile]
      : [];

    if (files.length === 0) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 }
      );
    }

    // Read all images as base64
    const base64Images: string[] = [];
    const mimeTypes: string[] = [];

    for (const file of files) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      base64Images.push(buffer.toString("base64"));
      mimeTypes.push(file.type || "image/jpeg");
    }

    // Extract data with AI (supports single or multiple images)
    const extracted = await extractReceiptData(
      base64Images.length === 1 ? base64Images[0] : base64Images,
      mimeTypes.length === 1 ? mimeTypes[0] : mimeTypes
    );

    // Save receipt to database (store first image as the primary)
    const sql = getDb();
    const receiptId = uuid();

    await sql`INSERT INTO receipts (id, supplier, receipt_date, subtotal, tax, total, image_data, image_mime_type, status)
       VALUES (${receiptId}, ${extracted.supplier || null}, ${extracted.receipt_date || null}, ${extracted.subtotal || 0}, ${extracted.tax || 0}, ${extracted.total || 0}, ${base64Images[0]}, ${mimeTypes[0]}, 'pending')`;

    // Save each extracted item
    const items: Array<{
      id: string;
      raw_name: string;
      quantity: number;
      unit_price: number;
      total_price: number;
      item_size: number | null;
      item_size_unit: string | null;
    }> = [];

    for (const item of extracted.items) {
      const itemId = uuid();
      await sql`INSERT INTO receipt_items (id, receipt_id, raw_name, quantity, unit_price, total_price, item_size, item_size_unit)
         VALUES (${itemId}, ${receiptId}, ${item.raw_name}, ${item.quantity}, ${item.unit_price}, ${item.total_price}, ${item.item_size}, ${item.item_size_unit})`;
      items.push({
        id: itemId,
        raw_name: item.raw_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        total_price: item.total_price,
        item_size: item.item_size,
        item_size_unit: item.item_size_unit,
      });
    }

    return NextResponse.json({
      receipt_id: receiptId,
      supplier: extracted.supplier,
      receipt_date: extracted.receipt_date,
      subtotal: extracted.subtotal,
      tax: extracted.tax,
      total: extracted.total,
      items,
      item_count: items.length,
      images_processed: files.length,
      _rawOcrText: (extracted as unknown as Record<string, unknown>)._rawOcrText || null,
    });
  } catch (error: unknown) {
    console.error("Error scanning receipt:", error);
    const message =
      error instanceof Error ? error.message : "Failed to scan receipt";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
