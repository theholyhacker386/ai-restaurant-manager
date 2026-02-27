import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET — return current business settings
export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`SELECT * FROM business_settings WHERE id = 'default'`;

    if (rows.length === 0) {
      return NextResponse.json({ settings: null });
    }

    const row = rows[0];
    return NextResponse.json({
      settings: {
        food_cost_target: Number(row.food_cost_target),
        food_cost_warning: Number(row.food_cost_warning),
        rplh_target: Number(row.rplh_target),
        max_staff: Number(row.max_staff),
        min_shift_hours: Number(row.min_shift_hours),
        labor_cost_target: Number(row.labor_cost_target),
        employer_burden_rate: Number(row.employer_burden_rate),
        business_hours: typeof row.business_hours === "string"
          ? JSON.parse(row.business_hours)
          : row.business_hours,
      },
    });
  } catch (error: any) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

// PUT — update business settings
export async function PUT(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();

    await sql`
      UPDATE business_settings SET
        food_cost_target = ${body.food_cost_target},
        food_cost_warning = ${body.food_cost_warning},
        rplh_target = ${body.rplh_target},
        max_staff = ${body.max_staff},
        min_shift_hours = ${body.min_shift_hours},
        labor_cost_target = ${body.labor_cost_target},
        employer_burden_rate = ${body.employer_burden_rate},
        business_hours = ${JSON.stringify(body.business_hours)},
        updated_at = NOW()
      WHERE id = 'default'
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error saving settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
