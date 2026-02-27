import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSettings } from "@/lib/settings";

export async function GET() {
  try {
    const sql = getDb();
    const settings = await getSettings();

    const sales = await sql`
      SELECT
        ds.date,
        ds.net_revenue as net_sales,
        COALESCE(dl.total_labor_cost, 0) as labor_cost,
        COALESCE(dl.total_hours, 0) as labor_hours,
        ds.order_count
      FROM daily_sales ds
      LEFT JOIN daily_labor dl ON ds.date = dl.date
      WHERE ds.date >= (CURRENT_DATE - INTERVAL '90 days')::TEXT
      ORDER BY ds.date
    ` as any[];

    if (sales.length < 7) {
      return NextResponse.json({
        hasEnoughData: false,
        daysOfData: sales.length,
        forecast: [],
        alerts: [],
      });
    }

    // Build day-of-week averages
    const dayStats: Record<number, { revenues: number[]; hours: number[]; orders: number[] }> = {};
    for (let d = 0; d < 7; d++) {
      dayStats[d] = { revenues: [], hours: [], orders: [] };
    }

    sales.forEach((s: any) => {
      const dayOfWeek = new Date(s.date + "T12:00:00").getDay();
      if (s.net_sales > 0) {
        dayStats[dayOfWeek].revenues.push(s.net_sales);
        dayStats[dayOfWeek].hours.push(s.labor_hours || 0);
        dayStats[dayOfWeek].orders.push(s.order_count || 0);
      }
    });

    const recentSales = sales.slice(-14);
    const olderSales = sales.slice(-28, -14);

    const recentAvg = recentSales.length > 0
      ? recentSales.reduce((s: number, r: any) => s + (r.net_sales || 0), 0) / recentSales.length
      : 0;
    const olderAvg = olderSales.length > 0
      ? olderSales.reduce((s: number, r: any) => s + (r.net_sales || 0), 0) / olderSales.length
      : recentAvg;

    const trendMultiplier = olderAvg > 0 ? recentAvg / olderAvg : 1;
    const cappedTrend = Math.max(0.7, Math.min(1.3, trendMultiplier));

    const today_str = new Date().toISOString().split("T")[0];
    const future_str = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

    const events = await sql`
      SELECT * FROM forecast_events
      WHERE date >= ${today_str} AND date <= ${future_str}
      ORDER BY date
    ` as any[];

    const eventMap = new Map<string, { name: string; adjustmentPct: number }>();
    events.forEach((e: any) => {
      eventMap.set(e.date, { name: e.name, adjustmentPct: e.adjustment_pct });
    });

    const forecast = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const forecastDate = new Date(today);
      forecastDate.setDate(today.getDate() + i);
      const dateStr = forecastDate.toISOString().split("T")[0];
      const dayOfWeek = forecastDate.getDay();

      const dayData = dayStats[dayOfWeek];
      const revenues = dayData.revenues;
      const hours = dayData.hours;
      const orders = dayData.orders;

      let avgRevenue = 0;
      let avgHours = 0;
      let avgOrders = 0;

      if (revenues.length > 0) {
        const n = revenues.length;
        const weights = revenues.map((_: any, idx: number) => 1 + idx / n);
        const totalWeight = weights.reduce((s: number, w: number) => s + w, 0);

        avgRevenue = revenues.reduce((s: number, r: number, idx: number) => s + r * weights[idx], 0) / totalWeight;
        avgHours = hours.reduce((s: number, h: number, idx: number) => s + h * weights[idx], 0) / totalWeight;
        avgOrders = orders.reduce((s: number, o: number, idx: number) => s + o * weights[idx], 0) / totalWeight;
      }

      let predictedRevenue = avgRevenue * cappedTrend;
      let predictedOrders = Math.round(avgOrders * cappedTrend);

      const event = eventMap.get(dateStr);
      let eventAdjustment = 0;
      if (event) {
        eventAdjustment = event.adjustmentPct;
        predictedRevenue *= (1 + eventAdjustment / 100);
        predictedOrders = Math.round(predictedOrders * (1 + eventAdjustment / 100));
      }

      const dataPoints = revenues.length;
      const confidencePct = dataPoints >= 8 ? 15 : dataPoints >= 4 ? 25 : 40;

      const targetRPLH = settings.rplh_target;
      const recommendedHours = predictedRevenue > 0 ? predictedRevenue / targetRPLH : 0;

      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

      forecast.push({
        date: dateStr,
        dayName: dayNames[dayOfWeek],
        dayNameShort: dayNamesShort[dayOfWeek],
        isToday: i === 0,
        predictedRevenue: Math.round(predictedRevenue),
        confidenceRange: Math.round(predictedRevenue * confidencePct / 100),
        predictedOrders,
        currentAvgHours: Math.round(avgHours * 10) / 10,
        recommendedHours: Math.round(recommendedHours * 10) / 10,
        hoursDifference: Math.round((avgHours - recommendedHours) * 10) / 10,
        dataPoints,
        event: event ? { name: event.name, adjustmentPct: event.adjustmentPct } : null,
      });
    }

    const alerts: any[] = [];
    const lastWeek = sales.slice(-7);
    lastWeek.forEach((day: any) => {
      const revenue = day.net_sales || 0;
      const hours = day.labor_hours || 0;
      const rplh = hours > 0 ? revenue / hours : 0;

      const rplhLow = settings.rplh_target * 0.7;
      const rplhDanger = settings.rplh_target * 0.5;
      const rplhHigh = settings.rplh_target * 1.5;
      const rplhHighDanger = settings.rplh_target * 2;

      if (hours > 0 && rplh < rplhLow) {
        alerts.push({
          type: "overstaffed",
          date: day.date,
          message: `RPLH was $${rplh.toFixed(0)}/hr`,
          severity: rplh < rplhDanger ? "danger" : "warning",
          metric: rplh,
        });
      } else if (hours > 0 && rplh > rplhHigh) {
        alerts.push({
          type: "understaffed",
          date: day.date,
          message: `RPLH was $${rplh.toFixed(0)}/hr`,
          severity: rplh > rplhHighDanger ? "danger" : "warning",
          metric: rplh,
        });
      }
    });

    return NextResponse.json({
      hasEnoughData: true,
      daysOfData: sales.length,
      forecast,
      alerts,
      trend: {
        recentAvg: Math.round(recentAvg),
        olderAvg: Math.round(olderAvg),
        multiplier: Math.round(cappedTrend * 100) / 100,
        direction: trendMultiplier > 1.05 ? "up" : trendMultiplier < 0.95 ? "down" : "stable",
      },
    });
  } catch (error) {
    console.error("Forecast error:", error);
    return NextResponse.json({ error: "Failed to generate forecast" }, { status: 500 });
  }
}
