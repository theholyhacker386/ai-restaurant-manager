import { NextRequest, NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { getTenantDb } from "@/lib/tenant";
import { decrypt } from "@/lib/encryption";

export async function POST(request: NextRequest) {
  try {
    const client = getPlaidClient();
    const { sql, restaurantId } = await getTenantDb();
    const { item_id } = await request.json();

    if (!item_id) {
      return NextResponse.json(
        { error: "Missing item_id" },
        { status: 400 }
      );
    }

    // Get the access token — only if it belongs to this restaurant
    const items = await sql`
      SELECT access_token FROM plaid_items
      WHERE item_id = ${item_id} AND restaurant_id = ${restaurantId}
    `;

    if (items.length > 0) {
      // Remove from Plaid
      try {
        await client.itemRemove({
          access_token: decrypt(items[0].access_token),
        });
      } catch {
        // If Plaid removal fails, still clean up locally
      }

      // Mark as inactive locally
      await sql`
        UPDATE plaid_items SET status = 'inactive', updated_at = NOW()
        WHERE item_id = ${item_id} AND restaurant_id = ${restaurantId}
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error disconnecting bank:", error);
    return NextResponse.json(
      { error: "Failed to disconnect bank account" },
      { status: 500 }
    );
  }
}
