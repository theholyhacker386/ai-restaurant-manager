import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { v4 as uuid } from "uuid";

/**
 * Save a push notification subscription.
 * Called when a user allows notifications on their device.
 */
export async function POST(req: Request) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const { subscription, userAgent } = await req.json();

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    // Upsert — if this endpoint already exists, just update the timestamp
    await sql`
      INSERT INTO push_subscriptions (id, endpoint, keys_p256dh, keys_auth, user_agent, restaurant_id)
      VALUES (${uuid()}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth}, ${userAgent || null}, ${restaurantId})
      ON CONFLICT (endpoint) DO UPDATE SET
        keys_p256dh = EXCLUDED.keys_p256dh,
        keys_auth = EXCLUDED.keys_auth,
        last_used = NOW()
    `;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Push subscribe error:", error);
    return NextResponse.json({ error: "Failed to save subscription" }, { status: 500 });
  }
}
