import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { ensureRemindersTable, calculateNextDue } from "@/lib/reminders";
import { v4 as uuid } from "uuid";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/reminders — list all reminders for the current restaurant
 */
export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();
    await ensureRemindersTable(sql);

    const reminders = await sql`
      SELECT * FROM recurring_reminders
      WHERE restaurant_id = ${restaurantId}
      ORDER BY enabled DESC, title ASC
    `;

    return NextResponse.json({ reminders });
  } catch (error: any) {
    console.error("GET /api/reminders error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/reminders — create a new reminder
 */
export async function POST(req: Request) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    await ensureRemindersTable(sql);

    const body = await req.json();
    const {
      title,
      description,
      frequency,
      dayOfWeek,
      dayOfMonth,
      monthOfYear,
      timeOfDay,
    } = body;

    if (!title || !frequency || !timeOfDay) {
      return NextResponse.json(
        { error: "title, frequency, and timeOfDay are required" },
        { status: 400 }
      );
    }

    const id = `rem_${uuid()}`;
    const nextDue = calculateNextDue(
      frequency,
      dayOfWeek,
      dayOfMonth,
      monthOfYear,
      timeOfDay
    );

    await sql`
      INSERT INTO recurring_reminders (
        id, restaurant_id, title, description, frequency,
        day_of_week, day_of_month, month_of_year,
        time_of_day, enabled, next_due_at, created_at, updated_at
      ) VALUES (
        ${id}, ${restaurantId}, ${title}, ${description || null}, ${frequency},
        ${dayOfWeek ?? null}, ${dayOfMonth ?? null}, ${monthOfYear ?? null},
        ${timeOfDay}, true, ${nextDue.toISOString()}, NOW(), NOW()
      )
    `;

    const [created] = await sql`
      SELECT * FROM recurring_reminders WHERE id = ${id}
    `;

    return NextResponse.json({ reminder: created }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/reminders error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PUT /api/reminders — update an existing reminder
 */
export async function PUT(req: Request) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    await ensureRemindersTable(sql);

    const body = await req.json();
    const {
      id,
      title,
      description,
      frequency,
      dayOfWeek,
      dayOfMonth,
      monthOfYear,
      timeOfDay,
      enabled,
    } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    // Fetch current record to merge fields
    const [existing] = await sql`
      SELECT * FROM recurring_reminders
      WHERE id = ${id} AND restaurant_id = ${restaurantId}
    `;

    if (!existing) {
      return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
    }

    const newTitle = title ?? existing.title;
    const newDesc = description !== undefined ? description : existing.description;
    const newFreq = frequency ?? existing.frequency;
    const newDow = dayOfWeek !== undefined ? dayOfWeek : existing.day_of_week;
    const newDom = dayOfMonth !== undefined ? dayOfMonth : existing.day_of_month;
    const newMoy = monthOfYear !== undefined ? monthOfYear : existing.month_of_year;
    const newTime = timeOfDay ?? existing.time_of_day;
    const newEnabled = enabled !== undefined ? enabled : existing.enabled;

    // Recalculate next_due_at if schedule changed
    const scheduleChanged =
      frequency !== undefined ||
      dayOfWeek !== undefined ||
      dayOfMonth !== undefined ||
      monthOfYear !== undefined ||
      timeOfDay !== undefined;

    const nextDue = scheduleChanged
      ? calculateNextDue(newFreq, newDow, newDom, newMoy, newTime, existing.last_sent_at)
      : existing.next_due_at;

    await sql`
      UPDATE recurring_reminders SET
        title = ${newTitle},
        description = ${newDesc},
        frequency = ${newFreq},
        day_of_week = ${newDow},
        day_of_month = ${newDom},
        month_of_year = ${newMoy},
        time_of_day = ${newTime},
        enabled = ${newEnabled},
        next_due_at = ${scheduleChanged ? (nextDue as Date).toISOString() : nextDue},
        updated_at = NOW()
      WHERE id = ${id} AND restaurant_id = ${restaurantId}
    `;

    const [updated] = await sql`
      SELECT * FROM recurring_reminders WHERE id = ${id}
    `;

    return NextResponse.json({ reminder: updated });
  } catch (error: any) {
    console.error("PUT /api/reminders error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * DELETE /api/reminders?id=rem_xxx — delete a reminder
 */
export async function DELETE(req: Request) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    await ensureRemindersTable(sql);

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "id query param is required" }, { status: 400 });
    }

    const result = await sql`
      DELETE FROM recurring_reminders
      WHERE id = ${id} AND restaurant_id = ${restaurantId}
      RETURNING id
    `;

    if (result.length === 0) {
      return NextResponse.json({ error: "Reminder not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, deleted: id });
  } catch (error: any) {
    console.error("DELETE /api/reminders error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
