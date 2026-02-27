import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  try {
    const { sql, restaurantId } = await getTenantDb();

    const sales = await sql`
      SELECT
        ds.date,
        ds.net_revenue as net_sales,
        COALESCE(dl.total_labor_cost, 0) as labor_cost,
        COALESCE(dl.total_hours, 0) as labor_hours
      FROM daily_sales ds
      LEFT JOIN daily_labor dl ON ds.date = dl.date AND dl.restaurant_id = ${restaurantId}
      WHERE ds.date >= ${startDate} AND ds.date <= ${endDate}
        AND ds.restaurant_id = ${restaurantId}
      ORDER BY ds.date
    ` as any[];

    // Analyze by day of week
    const dayOfWeekData: Record<number, { revenue: number; labor_hours: number; days: number }> = {};
    for (let d = 0; d < 7; d++) {
      dayOfWeekData[d] = { revenue: 0, labor_hours: 0, days: 0 };
    }

    sales.forEach((sale: any) => {
      const date = new Date(sale.date + "T12:00:00");
      const dayOfWeek = date.getDay();
      dayOfWeekData[dayOfWeek].revenue += sale.net_sales || 0;
      dayOfWeekData[dayOfWeek].labor_hours += sale.labor_hours || 0;
      dayOfWeekData[dayOfWeek].days += 1;
    });

    const dayOfWeekAnalysis = Object.entries(dayOfWeekData).map(([day, data]) => ({
      day: parseInt(day),
      dayName: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][parseInt(day)],
      avgRevenue: data.days > 0 ? data.revenue / data.days : 0,
      totalRevenue: data.revenue,
      avgLaborHours: data.days > 0 ? data.labor_hours / data.days : 0,
      rplh: data.labor_hours > 0 ? data.revenue / data.labor_hours : 0,
      occurrences: data.days,
    }));

    const totalRevenue = sales.reduce((sum: number, s: any) => sum + (s.net_sales || 0), 0);
    const totalLaborHours = sales.reduce((sum: number, s: any) => sum + (s.labor_hours || 0), 0);
    const totalLaborCost = sales.reduce((sum: number, s: any) => sum + (s.labor_cost || 0), 0);
    const overallRPLH = totalLaborHours > 0 ? totalRevenue / totalLaborHours : 0;
    const laborPercent = totalRevenue > 0 ? (totalLaborCost / totalRevenue) * 100 : 0;

    const peakDay = dayOfWeekAnalysis.reduce((max, d) => d.avgRevenue > max.avgRevenue ? d : max, dayOfWeekAnalysis[0]);
    const slowestDay = dayOfWeekAnalysis.reduce((min, d) => d.avgRevenue < min.avgRevenue ? d : min, dayOfWeekAnalysis[0]);

    return NextResponse.json({
      hourlyAnalysis: [],
      dayOfWeekAnalysis,
      overall: { totalRevenue, totalLaborHours, totalLaborCost, overallRPLH, laborPercent, daysAnalyzed: sales.length },
      insights: {
        peakHour: "N/A",
        peakDay: peakDay?.dayName || "N/A",
        slowestDay: slowestDay?.dayName || "N/A",
        optimalRPLH: 50,
        currentRPLH: overallRPLH,
      },
    });
  } catch (error) {
    console.error("Labor analysis error:", error);
    return NextResponse.json({ error: "Failed to analyze labor data" }, { status: 500 });
  }
}
