import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();

    const events = await sql`
      SELECT * FROM forecast_events
      WHERE date >= (CURRENT_DATE - INTERVAL '7 days')::TEXT
        AND restaurant_id = ${restaurantId}
      ORDER BY date
    `;

    return NextResponse.json({ events });
  } catch (error) {
    console.error("Events fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch events" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const body = await request.json();
    const { date, name, adjustmentPct, notes } = body;

    if (!date || !name) {
      return NextResponse.json({ error: "Date and name are required" }, { status: 400 });
    }

    const id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const adj = typeof adjustmentPct === "number" ? adjustmentPct : 30;

    await sql`INSERT INTO forecast_events (id, restaurant_id, date, name, adjustment_pct, notes)
      VALUES (${id}, ${restaurantId}, ${date}, ${name}, ${adj}, ${notes || null})`;

    return NextResponse.json({ id, date, name, adjustmentPct: adj, notes });
  } catch (error) {
    console.error("Event create error:", error);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Event ID required" }, { status: 400 });
  }

  try {
    const { sql, restaurantId } = await getTenantDb();
    await sql`DELETE FROM forecast_events WHERE id = ${id} AND restaurant_id = ${restaurantId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Event delete error:", error);
    return NextResponse.json({ error: "Failed to delete event" }, { status: 500 });
  }
}
