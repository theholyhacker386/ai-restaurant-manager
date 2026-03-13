import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/tenant";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET — load platform settings (admin only)
 */
export async function GET() {
  try {
    const { sql } = await getAdminDb();

    const rows = await sql`
      SELECT key, value FROM platform_settings
      WHERE key IN ('square_application_id', 'square_application_secret', 'square_environment')
    `;

    const settings: Record<string, string> = {};
    for (const row of rows) {
      // Mask the secret — only show last 4 chars
      if (row.key === "square_application_secret" && row.value) {
        settings[row.key] = "••••••••" + row.value.slice(-4);
      } else {
        settings[row.key] = row.value;
      }
    }

    return NextResponse.json({ settings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST — save platform settings (admin only)
 *
 * Body: { settings: { key: value, ... } }
 */
export async function POST(req: Request) {
  try {
    const { sql } = await getAdminDb();
    const { settings } = await req.json();

    if (!settings || typeof settings !== "object") {
      return NextResponse.json({ error: "Settings object is required" }, { status: 400 });
    }

    const allowedKeys = ["square_application_id", "square_application_secret", "square_environment"];

    for (const [key, value] of Object.entries(settings)) {
      if (!allowedKeys.includes(key)) continue;

      // Skip masked secrets (user didn't change it)
      if (key === "square_application_secret" && typeof value === "string" && value.startsWith("••••")) {
        continue;
      }

      await sql`
        INSERT INTO platform_settings (key, value, updated_at)
        VALUES (${key}, ${value as string}, NOW())
        ON CONFLICT (key) DO UPDATE SET value = ${value as string}, updated_at = NOW()
      `;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
