import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import webpush from "web-push";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Send a push notification to all subscribed devices.
 * Called by the morning briefing cron or manually.
 */

// Configure web-push with VAPID keys
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    `mailto:${process.env.CONTACT_EMAIL || "shopcolby@gmail.com"}`,
    VAPID_PUBLIC,
    VAPID_PRIVATE
  );
}

export async function POST(req: Request) {
  try {
    const sql = getDb();
    const { title, body, url, tag } = await req.json();

    if (!title || !body) {
      return NextResponse.json({ error: "title and body required" }, { status: 400 });
    }

    // Get all push subscriptions
    const subscriptions = (await sql`
      SELECT id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions
    `) as Array<{ id: string; endpoint: string; keys_p256dh: string; keys_auth: string }>;

    if (subscriptions.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: "No subscriptions found" });
    }

    const payload = JSON.stringify({
      title,
      body,
      url: url || "/",
      tag: tag || "porch-notification",
    });

    let sent = 0;
    const failed: string[] = [];

    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys_p256dh,
              auth: sub.keys_auth,
            },
          },
          payload
        );
        sent++;

        // Update last_used timestamp
        await sql`UPDATE push_subscriptions SET last_used = NOW() WHERE id = ${sub.id}`;
      } catch (err: any) {
        // If the subscription is no longer valid (410 Gone or 404), remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await sql`DELETE FROM push_subscriptions WHERE id = ${sub.id}`;
          failed.push(`${sub.id} (expired, removed)`);
        } else {
          failed.push(`${sub.id} (${err.message})`);
        }
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed: failed.length,
      details: failed.length > 0 ? failed : undefined,
    });
  } catch (error: any) {
    console.error("Push send error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
