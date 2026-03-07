import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";

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

    const { sql, restaurantId } = await getTenantDb();

    // Rate limit: 15 image requests per 15 minutes per restaurant
    const { limited } = checkRateLimit(`receipt-image-${restaurantId}`, 15, 15 * 60 * 1000);
    if (limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const rows = await sql`SELECT image_data, image_mime_type FROM receipts WHERE id = ${receiptId} AND restaurant_id = ${restaurantId}`;
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
