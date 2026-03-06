import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import { logAuditEvent, getRequestMeta } from "@/lib/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// POST — Delete own account and associated data
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const userId = session.user.id;
    const userRole = (session.user as any).role;

    // Owners can't delete their own account (would orphan the restaurant)
    if (userRole === "owner") {
      return NextResponse.json(
        { error: "The owner account cannot be deleted. Transfer ownership first." },
        { status: 403 }
      );
    }

    const { sql, restaurantId } = await getTenantDb();
    const { ipAddress, userAgent } = getRequestMeta(request);

    // Try to revoke Plaid access tokens (Plaid may not be configured yet)
    try {
      const { decrypt } = await import("@/lib/encryption");
      const { getPlaidClient } = await import("@/lib/plaid");

      const plaidItems = await sql`
        SELECT access_token, item_id
        FROM plaid_items
        WHERE restaurant_id = ${restaurantId} AND status = 'active'
      `;

      if (plaidItems.length > 0) {
        const client = getPlaidClient();
        for (const item of plaidItems) {
          try {
            await client.itemRemove({ access_token: decrypt(item.access_token) });
            await sql`UPDATE plaid_items SET status = 'revoked', updated_at = NOW() WHERE item_id = ${item.item_id}`;
          } catch {
            console.error(`Failed to revoke Plaid token for item ${item.item_id}`);
          }
        }
      }
    } catch {
      // Plaid/encryption not configured or no items — continue with deletion
    }

    // Delete user's consent records (table may not exist yet)
    try {
      await sql`DELETE FROM consent_records WHERE user_id = ${userId}`;
    } catch {
      // consent_records table doesn't exist yet — that's fine
    }

    // Keep audit logs for compliance but anonymize them
    try {
      await sql`UPDATE audit_log SET user_email = 'deleted', user_id = 'deleted-' || ${userId} WHERE user_id = ${userId}`;
    } catch {
      // audit_log table doesn't exist yet — that's fine
    }

    // Delete the user account
    await sql`DELETE FROM users WHERE id = ${userId} AND restaurant_id = ${restaurantId}`;

    logAuditEvent({
      restaurantId,
      eventType: "data_deleted",
      userId: "deleted-" + userId,
      userEmail: session.user.email || undefined,
      userRole,
      ipAddress,
      userAgent,
      details: { action: "account_deleted" },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Account deletion error:", error);
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
