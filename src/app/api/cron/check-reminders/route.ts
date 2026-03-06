import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureRemindersTable, calculateNextDue } from "@/lib/reminders";
import webpush from "web-push";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Cron: Check recurring reminders every hour.
 * Runs across ALL restaurants (uses getDb, not getTenantDb).
 *
 * For each reminder that is due:
 *   1. Send a push notification to all subscribed devices for that restaurant
 *   2. Update last_sent_at and recalculate next_due_at
 */

// Verify this is coming from Vercel Cron (production) or allow in dev
function verifyCron(req: Request): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export async function GET(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return checkReminders();
}

export async function POST(req: Request) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return checkReminders();
}

async function checkReminders() {
  try {
    const sql = getDb();
    await ensureRemindersTable(sql);

    // Configure web-push
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY || "";

    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(
        `mailto:${process.env.CONTACT_EMAIL || "shopcolby@gmail.com"}`,
        vapidPublic,
        vapidPrivate
      );
    }

    // Find all reminders that are due
    const dueReminders = (await sql`
      SELECT r.*, rest.name as restaurant_name
      FROM recurring_reminders r
      JOIN restaurants rest ON rest.id = r.restaurant_id
      WHERE r.enabled = true
        AND r.next_due_at <= NOW()
        AND (r.last_sent_at IS NULL OR r.last_sent_at < r.next_due_at)
    `) as any[];

    if (dueReminders.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No reminders due",
        checked: 0,
        sent: 0,
      });
    }

    let totalSent = 0;
    const results: Array<{ id: string; title: string; restaurant: string; pushSent: number }> = [];

    for (const reminder of dueReminders) {
      let pushSent = 0;

      // Send push notification to all subscriptions for this restaurant
      if (vapidPublic && vapidPrivate) {
        try {
          const subscriptions = (await sql`
            SELECT id, endpoint, keys_p256dh, keys_auth
            FROM push_subscriptions
            WHERE restaurant_id = ${reminder.restaurant_id}
          `) as Array<{ id: string; endpoint: string; keys_p256dh: string; keys_auth: string }>;

          const payload = JSON.stringify({
            title: `Reminder: ${reminder.title}`,
            body: reminder.description || `Time for: ${reminder.title}`,
            url: "/reminders",
            tag: `reminder-${reminder.id}`,
          });

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
              pushSent++;
            } catch (err: any) {
              // Remove expired subscriptions
              if (err.statusCode === 410 || err.statusCode === 404) {
                await sql`DELETE FROM push_subscriptions WHERE id = ${sub.id}`;
              }
            }
          }
        } catch (pushErr) {
          console.error(`[check-reminders] Push error for ${reminder.id}:`, pushErr);
        }
      }

      // Calculate the next occurrence
      const nextDue = calculateNextDue(
        reminder.frequency,
        reminder.day_of_week,
        reminder.day_of_month,
        reminder.month_of_year,
        reminder.time_of_day,
        new Date() // last sent = now
      );

      // Update the reminder
      await sql`
        UPDATE recurring_reminders
        SET last_sent_at = NOW(),
            next_due_at = ${nextDue.toISOString()},
            updated_at = NOW()
        WHERE id = ${reminder.id}
      `;

      totalSent += pushSent;
      results.push({
        id: reminder.id,
        title: reminder.title,
        restaurant: reminder.restaurant_name,
        pushSent,
      });

      console.log(
        `[check-reminders] Sent "${reminder.title}" for ${reminder.restaurant_name} — ${pushSent} push(es)`
      );
    }

    return NextResponse.json({
      success: true,
      checked: dueReminders.length,
      sent: totalSent,
      results,
    });
  } catch (error: any) {
    console.error("[check-reminders] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
