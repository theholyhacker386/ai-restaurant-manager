import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET - serve receipt images from database
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const receiptId = searchParams.get("id") || searchParams.get("path");

    if (!receiptId) {
      return NextResponse.json(
        { error: "No receipt ID provided" },
        { status: 400 }
      );
    }

    const sql = getDb();

    const rows = await sql`SELECT image_data, image_mime_type FROM receipts WHERE id = ${receiptId}`;
    const receipt = rows[0] as { image_data: string | null; image_mime_type: string | null } | undefined;

    if (!receipt || !receipt.image_data) {
      return NextResponse.json(
        { error: "Image not found" },
        { status: 404 }
      );
    }

    const buffer = Buffer.from(receipt.image_data, "base64");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": receipt.image_mime_type || "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error: unknown) {
    console.error("Error serving receipt image:", error);
    return NextResponse.json(
      { error: "Failed to serve image" },
      { status: 500 }
    );
  }
}
