import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// GET - return all stored UX comment exports
export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`SELECT id, received_at, payload FROM ux_comments ORDER BY id DESC LIMIT 100`;
    return NextResponse.json({
      ok: true,
      count: rows.length,
      entries: rows.map((r) => ({ id: r.id, receivedAt: r.received_at, ...r.payload as object })),
    });
  } catch (err) {
    console.error("GET /api/ux-comments error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to read UX comments" },
      { status: 500 }
    );
  }
}

// POST - append a new UX comment export
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = {
      ...body,
      receivedAt: new Date().toISOString(),
    };

    const sql = getDb();
    await sql`INSERT INTO ux_comments (payload) VALUES (${JSON.stringify(payload)}::jsonb)`;

    return NextResponse.json({
      ok: true,
      message: "Comments saved",
    });
  } catch (err) {
    console.error("POST /api/ux-comments error:", err);
    return NextResponse.json(
      { ok: false, error: "Failed to save UX comments" },
      { status: 500 }
    );
  }
}
