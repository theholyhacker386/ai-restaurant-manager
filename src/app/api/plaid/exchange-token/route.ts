import { NextRequest, NextResponse } from "next/server";
import { getPlaidClient, ensurePlaidTables } from "@/lib/plaid";
import { getTenantDb } from "@/lib/tenant";
import { encrypt } from "@/lib/encryption";
import { logAuditEvent, getRequestMeta } from "@/lib/audit";
import { v4 as uuid } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const client = getPlaidClient();
    const { sql, restaurantId } = await getTenantDb();
    const { public_token, institution } = await request.json();

    if (!public_token) {
      return NextResponse.json(
        { error: "Missing public_token" },
        { status: 400 }
      );
    }

    await ensurePlaidTables(sql);

    // Exchange public token for access token
    const exchangeResponse = await client.itemPublicTokenExchange({
      public_token,
    });

    const accessToken = exchangeResponse.data.access_token;
    const itemId = exchangeResponse.data.item_id;
    const encryptedToken = encrypt(accessToken);

    // Save the Plaid item with restaurant_id
    const id = uuid();
    await sql`
      INSERT INTO plaid_items (id, restaurant_id, access_token, item_id, institution_id, institution_name)
      VALUES (${id}, ${restaurantId}, ${encryptedToken}, ${itemId}, ${institution?.institution_id || null}, ${institution?.name || null})
      ON CONFLICT (item_id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        institution_id = EXCLUDED.institution_id,
        institution_name = EXCLUDED.institution_name,
        updated_at = NOW()
    `;

    // Fetch and save accounts
    const accountsResponse = await client.accountsGet({
      access_token: accessToken,
    });

    for (const account of accountsResponse.data.accounts) {
      const accountDbId = uuid();
      await sql`
        INSERT INTO plaid_accounts (id, restaurant_id, plaid_item_id, account_id, name, official_name, type, subtype, mask, current_balance, available_balance, last_synced)
        VALUES (${accountDbId}, ${restaurantId}, ${id}, ${account.account_id}, ${account.name}, ${account.official_name || null}, ${account.type}, ${account.subtype || null}, ${account.mask || null}, ${account.balances.current}, ${account.balances.available}, NOW())
        ON CONFLICT (account_id) DO UPDATE SET
          name = EXCLUDED.name,
          current_balance = EXCLUDED.current_balance,
          available_balance = EXCLUDED.available_balance,
          last_synced = NOW()
      `;
    }

    // Log audit event for bank connection
    const { ipAddress, userAgent } = getRequestMeta(request);
    logAuditEvent({
      restaurantId,
      eventType: 'plaid_connected',
      userId: '',
      ipAddress,
      userAgent,
      details: { institution_name: institution?.name, item_id: itemId },
    });

    return NextResponse.json({
      success: true,
      item_id: itemId,
      accounts: accountsResponse.data.accounts.map((a) => ({
        account_id: a.account_id,
        name: a.name,
        type: a.type,
        subtype: a.subtype,
        mask: a.mask,
        balance: a.balances.current,
      })),
    });
  } catch (error: unknown) {
    console.error("Error exchanging token:", error);
    return NextResponse.json(
      { error: "Failed to connect bank account" },
      { status: 500 }
    );
  }
}
