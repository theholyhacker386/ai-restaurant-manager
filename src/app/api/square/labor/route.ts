import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { fetchLaborData } from "@/lib/square";
import { v4 as uuid } from "uuid";

// Shared helper: compute labor totals from a list of shifts
function computeLaborTotals(shifts: any[], totalRevenue: number) {
  const salesShifts = shifts.filter((s) => s.shift_type === "sales");
  const opsShifts = shifts.filter((s) => s.shift_type !== "sales");
  const salesLaborCost = salesShifts.reduce((s, sh) => s + Number(sh.total_pay), 0);
  const opsLaborCost = opsShifts.reduce((s, sh) => s + Number(sh.total_pay), 0);
  const salesHours = salesShifts.reduce((s, sh) => s + Number(sh.hours_worked), 0);
  const opsHours = opsShifts.reduce((s, sh) => s + Number(sh.hours_worked), 0);
  const totalLaborCost = shifts.reduce((s, sh) => s + Number(sh.total_pay), 0);
  const totalHours = shifts.reduce((s, sh) => s + Number(sh.hours_worked), 0);
  const laborPct = totalRevenue > 0 ? (salesLaborCost / totalRevenue) * 100 : 0;

  return {
    total_labor_cost: Math.round(totalLaborCost * 100) / 100,
    total_hours: Math.round(totalHours * 100) / 100,
    total_shifts: shifts.length,
    total_revenue: totalRevenue,
    labor_percentage: Math.round(laborPct * 10) / 10,
    sales_labor_cost: Math.round(salesLaborCost * 100) / 100,
    sales_hours: Math.round(salesHours * 100) / 100,
    sales_shifts: salesShifts.length,
    ops_labor_cost: Math.round(opsLaborCost * 100) / 100,
    ops_hours: Math.round(opsHours * 100) / 100,
    ops_shifts: opsShifts.length,
  };
}

// GET - fast DB-only read for saved labor data
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    const sql = getDb();

    const shifts = await sql`SELECT date, team_member_name, hours_worked, hourly_rate, total_pay, start_at, end_at, shift_type, job_title
         FROM labor_shifts
         WHERE date >= ${startDate} AND date <= ${endDate}
         ORDER BY date DESC, start_at DESC`;

    const revenueRows = await sql`SELECT COALESCE(SUM(total_revenue), 0) as total_revenue
         FROM daily_sales
         WHERE date >= ${startDate} AND date <= ${endDate}`;
    const revenue = Number((revenueRows[0] as any).total_revenue || 0);

    return NextResponse.json({
      shifts,
      totals: computeLaborTotals(shifts as any[], revenue),
    });
  } catch (error: unknown) {
    console.error("Labor API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch labor data" },
      { status: 500 }
    );
  }
}

// POST - sync labor data from Square, save to DB, return display-ready data
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { startDate, endDate } = body;

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: "startDate and endDate are required" },
        { status: 400 }
      );
    }

    const shifts = await fetchLaborData(startDate, endDate);
    const sql = getDb();

    const dailyMap: Record<string, { cost: number; hours: number; count: number }> = {};

    // Save ALL shifts (open + closed) to DB. Open shifts get updated
    // on the next sync when they close, via ON CONFLICT.
    const openShifts: any[] = [];

    for (const shift of shifts) {
      if (!shift.date) continue;

      // Save every shift to DB (open or closed)
      await sql`INSERT INTO labor_shifts (id, square_shift_id, date, team_member_name, team_member_id, start_at, end_at, hours_worked, hourly_rate, total_pay, shift_type, job_title)
        VALUES (${uuid()}, ${shift.square_shift_id}, ${shift.date}, ${shift.team_member_name}, ${shift.team_member_id}, ${shift.start_at}, ${shift.end_at || ''}, ${shift.hours_worked}, ${shift.hourly_rate}, ${shift.total_pay}, ${shift.shift_type || 'sales'}, ${shift.job_title || ''})
        ON CONFLICT(square_shift_id) DO UPDATE SET
          start_at = EXCLUDED.start_at,
          end_at = EXCLUDED.end_at,
          hours_worked = EXCLUDED.hours_worked,
          hourly_rate = EXCLUDED.hourly_rate,
          total_pay = EXCLUDED.total_pay,
          team_member_name = EXCLUDED.team_member_name,
          shift_type = EXCLUDED.shift_type,
          job_title = EXCLUDED.job_title`;

      if (!dailyMap[shift.date]) {
        dailyMap[shift.date] = { cost: 0, hours: 0, count: 0 };
      }
      dailyMap[shift.date].cost += shift.total_pay;
      dailyMap[shift.date].hours += shift.hours_worked;
      dailyMap[shift.date].count++;

      if (shift.is_open) {
        openShifts.push({
          date: shift.date,
          team_member_name: shift.team_member_name,
          hours_worked: shift.hours_worked,
          hourly_rate: shift.hourly_rate,
          total_pay: shift.total_pay,
          start_at: shift.start_at,
          end_at: "",
          shift_type: shift.shift_type,
          job_title: shift.job_title,
          is_open: true,
        });
      }
    }

    for (const [date, day] of Object.entries(dailyMap)) {
      await sql`INSERT INTO daily_labor (id, date, total_labor_cost, total_hours, shift_count, updated_at)
        VALUES (${uuid()}, ${date}, ${Math.round(day.cost * 100) / 100}, ${Math.round(day.hours * 100) / 100}, ${day.count}, NOW())
        ON CONFLICT(date) DO UPDATE SET
          total_labor_cost = EXCLUDED.total_labor_cost,
          total_hours = EXCLUDED.total_hours,
          shift_count = EXCLUDED.shift_count,
          updated_at = NOW()`;
    }

    // Read back all saved shifts + merge open shifts for display-ready response
    const dbShifts = await sql`SELECT date, team_member_name, hours_worked, hourly_rate, total_pay, start_at, end_at, shift_type, job_title
         FROM labor_shifts
         WHERE date >= ${startDate} AND date <= ${endDate}
         ORDER BY date DESC, start_at DESC`;

    const allShifts = [...(dbShifts as any[]), ...openShifts];

    const revenueRows = await sql`SELECT COALESCE(SUM(total_revenue), 0) as total_revenue
         FROM daily_sales
         WHERE date >= ${startDate} AND date <= ${endDate}`;
    const revenue = Number((revenueRows[0] as any).total_revenue || 0);

    return NextResponse.json({
      success: true,
      shifts: allShifts,
      totals: computeLaborTotals(allShifts, revenue),
      openShifts,
    });
  } catch (error: unknown) {
    console.error("Labor sync error:", error);
    const message = error instanceof Error ? error.message : "Failed to sync labor data";
    if (message.includes("not configured")) {
      return NextResponse.json(
        { error: "Square API is not configured. Please set your Square access token." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
