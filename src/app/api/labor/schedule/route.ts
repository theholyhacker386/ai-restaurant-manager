import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { getSettings } from "@/lib/settings";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: Request) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const settings = await getSettings(restaurantId);

    const { searchParams } = new URL(request.url);
    const offsetWeeks = parseInt(searchParams.get("weekOffset") || "0", 10);

    // ── 1. Get hourly sales distribution by day-of-week (last 90 days) ──
    const hourlyData = await sql`
      SELECT
        EXTRACT(DOW FROM (date || 'T12:00:00')::timestamp) AS dow,
        hour,
        AVG(net_revenue) AS avg_revenue
      FROM hourly_sales
      WHERE date >= (CURRENT_DATE - INTERVAL '90 days')::TEXT
        AND net_revenue > 0
        AND restaurant_id = ${restaurantId}
      GROUP BY dow, hour
      ORDER BY dow, hour
    ` as any[];

    // Build a map: dayOfWeek → { hour → avgRevenue }
    const hourlyByDay: Record<number, Record<number, number>> = {};
    for (let d = 0; d < 7; d++) hourlyByDay[d] = {};

    hourlyData.forEach((row: any) => {
      const dow = Number(row.dow);
      const hour = Number(row.hour);
      hourlyByDay[dow][hour] = Number(row.avg_revenue);
    });

    // Calculate hourly distribution percentages per day-of-week
    const hourlyPct: Record<number, Record<number, number>> = {};
    for (let d = 0; d < 7; d++) {
      const hours = hourlyByDay[d];
      const dayTotal = Object.values(hours).reduce((sum, v) => sum + v, 0);
      hourlyPct[d] = {};
      for (const [h, rev] of Object.entries(hours)) {
        hourlyPct[d][Number(h)] = dayTotal > 0 ? rev / dayTotal : 0;
      }
    }

    // ── 2. Get predicted daily revenue (same logic as forecast endpoint) ──
    const sales = await sql`
      SELECT
        ds.date,
        ds.net_revenue as net_sales
      FROM daily_sales ds
      WHERE ds.date >= (CURRENT_DATE - INTERVAL '90 days')::TEXT
        AND ds.restaurant_id = ${restaurantId}
      ORDER BY ds.date
    ` as any[];

    // Day-of-week averages with recency weighting and outlier protection.
    // If a single day's revenue is way above average (e.g. an anniversary
    // event), cap it so one special day doesn't inflate the whole schedule.
    const dayStats: Record<number, number[]> = {};
    for (let d = 0; d < 7; d++) dayStats[d] = [];

    sales.forEach((s: any) => {
      const dayOfWeek = new Date(s.date + "T12:00:00").getDay();
      if (s.net_sales > 0) {
        dayStats[dayOfWeek].push(s.net_sales);
      }
    });

    // Outlier cap: if a day's revenue is more than 1.5x the median for
    // that day of the week, cap it at 1.5x median. This prevents one-off
    // events (anniversaries, special events) from skewing the average.
    for (let d = 0; d < 7; d++) {
      const vals = dayStats[d];
      if (vals.length < 3) continue; // not enough data to detect outliers
      const sorted = [...vals].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const cap = median * 1.5;
      dayStats[d] = vals.map((v) => Math.min(v, cap));
    }

    // Trend multiplier (recent 14 days vs previous 14 days)
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

    // Forecast events for the schedule window
    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + offsetWeeks * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const startStr = weekStart.toISOString().split("T")[0];
    const endStr = weekEnd.toISOString().split("T")[0];

    const events = await sql`
      SELECT * FROM forecast_events
      WHERE date >= ${startStr} AND date <= ${endStr}
        AND restaurant_id = ${restaurantId}
      ORDER BY date
    ` as any[];

    const eventMap = new Map<string, { name: string; adjustmentPct: number }>();
    events.forEach((e: any) => {
      eventMap.set(e.date, { name: e.name, adjustmentPct: e.adjustment_pct });
    });

    // ── 3. Build the 7-day schedule ──
    const TARGET_RPLH = settings.rplh_target;
    const MAX_STAFF = settings.max_staff;
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayNamesShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const schedule = [];
    let weekTotalHours = 0;
    let weekTotalRevenue = 0;

    for (let i = 0; i < 7; i++) {
      const forecastDate = new Date(weekStart);
      forecastDate.setDate(weekStart.getDate() + i);
      const dateStr = forecastDate.toISOString().split("T")[0];
      const dayOfWeek = forecastDate.getDay();

      const businessHrs = settings.business_hours[String(dayOfWeek)];
      const isClosed = !businessHrs;

      // Day-of-week weighted average revenue
      const revenues = dayStats[dayOfWeek];
      let avgRevenue = 0;
      if (revenues.length > 0) {
        const n = revenues.length;
        const weights = revenues.map((_: any, idx: number) => 1 + idx / n);
        const totalWeight = weights.reduce((s: number, w: number) => s + w, 0);
        avgRevenue = revenues.reduce((s: number, r: number, idx: number) => s + r * weights[idx], 0) / totalWeight;
      }

      let predictedRevenue = avgRevenue * cappedTrend;

      const event = eventMap.get(dateStr);
      if (event) {
        predictedRevenue *= (1 + event.adjustmentPct / 100);
      }

      predictedRevenue = Math.round(predictedRevenue);

      if (isClosed) {
        schedule.push({
          date: dateStr,
          dayName: dayNames[dayOfWeek],
          dayNameShort: dayNamesShort[dayOfWeek],
          isToday: dateStr === today.toISOString().split("T")[0],
          isClosed: true,
          predictedRevenue: 0,
          totalRecommendedHours: 0,
          hours: [],
          event: event ? { name: event.name, adjustmentPct: event.adjustmentPct } : null,
        });
        continue;
      }

      // Parse open/close hours
      const openHour = parseInt(businessHrs.open.split(":")[0], 10);
      const closeHour = parseInt(businessHrs.close.split(":")[0], 10);

      // Build hourly recommendations — two-pass approach:
      // Pass 1: calculate raw headcount per hour
      // Pass 2: smooth 3rd-person shifts into realistic 4-hour blocks
      const MIN_SHIFT_HOURS = settings.min_shift_hours;

      interface HourSlot {
        hour: number;
        hourLabel: string;
        predictedRevenue: number;
        rawStaff: number;
        recommendedStaff: number;
        intensity: "light" | "moderate" | "busy";
      }

      const hours: HourSlot[] = [];

      for (let h = openHour; h < closeHour; h++) {
        const pct = hourlyPct[dayOfWeek]?.[h] || 0;
        const predictedHourlyRev = Math.round(predictedRevenue * pct);
        const rawStaff = predictedHourlyRev / TARGET_RPLH;
        const recommendedStaff = Math.min(MAX_STAFF, Math.max(1, Math.round(rawStaff)));
        const hourLabel = h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;

        hours.push({
          hour: h,
          hourLabel,
          predictedRevenue: predictedHourlyRev,
          rawStaff,
          recommendedStaff,
          intensity: "light", // will be set in pass 2
        });
      }

      // Pass 2: Smart 3rd-person shift logic
      // Rules:
      //   - If only 1 hour needs 3 people → keep at 2, they can handle it
      //   - If 2+ hours need 3 people → bring in 3rd person for a 4-hour
      //     shift block starting at the first busy hour
      // This prevents unrealistic 1-hour spikes and ensures the 3rd person
      // gets a real shift worth coming in for.
      const busyHours = hours.filter((h) => h.recommendedStaff >= 3);
      const threeCount = busyHours.length;

      if (threeCount >= 2) {
        // Justified — give the 3rd person a real 4-hour shift
        const firstThreeIdx = hours.findIndex((h) => h.recommendedStaff >= 3);
        const blockEnd = Math.min(firstThreeIdx + MIN_SHIFT_HOURS, hours.length);
        for (let j = firstThreeIdx; j < blockEnd; j++) {
          hours[j].recommendedStaff = 3;
        }
      }
      // Cap everything at 2 for hours outside the 3-person block (or all
      // hours if a 3rd person isn't justified)
      for (const h of hours) {
        if (threeCount < 2 && h.recommendedStaff > 2) {
          h.recommendedStaff = 2;
        }
      }

      // Set intensity colors and total up hours
      let dayTotalHours = 0;
      for (const h of hours) {
        if (h.recommendedStaff >= 3) h.intensity = "busy";
        else if (h.recommendedStaff >= 2) h.intensity = "moderate";
        else h.intensity = "light";
        dayTotalHours += h.recommendedStaff;
      }

      weekTotalHours += dayTotalHours;
      weekTotalRevenue += predictedRevenue;

      schedule.push({
        date: dateStr,
        dayName: dayNames[dayOfWeek],
        dayNameShort: dayNamesShort[dayOfWeek],
        isToday: dateStr === today.toISOString().split("T")[0],
        isClosed: false,
        predictedRevenue,
        totalRecommendedHours: dayTotalHours,
        hours,
        event: event ? { name: event.name, adjustmentPct: event.adjustmentPct } : null,
      });
    }

    // ── 4. Format business hours for the response ──
    const businessHoursFormatted: Record<number, { open: string; close: string } | null> = {};
    for (let d = 0; d < 7; d++) {
      businessHoursFormatted[d] = settings.business_hours[String(d)] || null;
    }

    return NextResponse.json({
      schedule,
      businessHours: businessHoursFormatted,
      weekTotals: {
        totalStaffHours: weekTotalHours,
        totalPredictedRevenue: weekTotalRevenue,
      },
      weekStart: startStr,
      weekEnd: endStr,
    });
  } catch (error) {
    console.error("Schedule error:", error);
    return NextResponse.json({ error: "Failed to generate schedule" }, { status: 500 });
  }
}
