import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: Request) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "quarterly";
    const year = parseInt(
      url.searchParams.get("year") || String(new Date().getFullYear())
    );

    // Ensure tax columns exist
    await sql`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS sales_tax_rate DECIMAL`;
    await sql`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS state TEXT`;
    await sql`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS county TEXT`;
    await sql`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS tax_filing_frequency TEXT DEFAULT 'quarterly'`;

    // Get tax settings
    const settings = await sql`
      SELECT sales_tax_rate, state, county, tax_filing_frequency
      FROM business_settings
      WHERE restaurant_id = ${restaurantId}
    `;

    const taxRate = Number(settings[0]?.sales_tax_rate) || 0;
    const state = settings[0]?.state || null;
    const filingFrequency =
      settings[0]?.tax_filing_frequency || "quarterly";

    // Calculate periods based on frequency
    const periods = [];

    if (period === "monthly") {
      // Generate 12 months
      for (let month = 0; month < 12; month++) {
        const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
        const endDay = new Date(year, month + 1, 0).getDate();
        const endDate = `${year}-${String(month + 1).padStart(2, "0")}-${endDay}`;

        const sales = await sql`
          SELECT
            COALESCE(SUM(total_revenue), 0) as total_revenue,
            COALESCE(SUM(total_tax), 0) as tax_collected,
            COALESCE(SUM(net_revenue), 0) as net_revenue,
            COUNT(*) as days_with_sales
          FROM daily_sales
          WHERE restaurant_id = ${restaurantId}
            AND date >= ${startDate} AND date <= ${endDate}
        `;

        const monthName = new Date(year, month).toLocaleString("default", {
          month: "long",
        });

        // Due date: 20th of following month
        const dueDate = new Date(year, month + 1, 20);
        const now = new Date();
        const isPast = dueDate < now;
        const isCurrent =
          month === now.getMonth() && year === now.getFullYear();

        periods.push({
          label: `${monthName} ${year}`,
          startDate,
          endDate,
          totalRevenue: Number(sales[0].total_revenue),
          taxCollected: Number(sales[0].tax_collected),
          netRevenue: Number(sales[0].net_revenue),
          daysWithSales: Number(sales[0].days_with_sales),
          taxOwed: Number(sales[0].tax_collected), // Tax owed = tax collected (pass-through)
          dueDate: dueDate.toISOString().split("T")[0],
          status: isCurrent ? "current" : isPast ? "past_due" : "upcoming",
        });
      }
    } else {
      // Quarterly
      const quarters = [
        {
          label: "Q1 (Jan-Mar)",
          startMonth: 1,
          endMonth: 3,
          dueMonth: 4,
          dueDay: 30,
        },
        {
          label: "Q2 (Apr-Jun)",
          startMonth: 4,
          endMonth: 6,
          dueMonth: 7,
          dueDay: 31,
        },
        {
          label: "Q3 (Jul-Sep)",
          startMonth: 7,
          endMonth: 9,
          dueMonth: 10,
          dueDay: 31,
        },
        {
          label: "Q4 (Oct-Dec)",
          startMonth: 10,
          endMonth: 12,
          dueMonth: 1,
          dueDay: 31,
        },
      ];

      for (let qi = 0; qi < quarters.length; qi++) {
        const q = quarters[qi];
        const startDate = `${year}-${String(q.startMonth).padStart(2, "0")}-01`;
        const endDay = new Date(year, q.endMonth, 0).getDate();
        const endDate = `${year}-${String(q.endMonth).padStart(2, "0")}-${endDay}`;

        const sales = await sql`
          SELECT
            COALESCE(SUM(total_revenue), 0) as total_revenue,
            COALESCE(SUM(total_tax), 0) as tax_collected,
            COALESCE(SUM(net_revenue), 0) as net_revenue,
            COUNT(*) as days_with_sales
          FROM daily_sales
          WHERE restaurant_id = ${restaurantId}
            AND date >= ${startDate} AND date <= ${endDate}
        `;

        const dueYear = q.dueMonth === 1 ? year + 1 : year;
        const dueDate = new Date(dueYear, q.dueMonth - 1, q.dueDay);
        const now = new Date();
        const isPast = dueDate < now;
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const isCurrent = qi === currentQuarter && year === now.getFullYear();

        periods.push({
          label: `${q.label} ${year}`,
          startDate,
          endDate,
          totalRevenue: Number(sales[0].total_revenue),
          taxCollected: Number(sales[0].tax_collected),
          netRevenue: Number(sales[0].net_revenue),
          daysWithSales: Number(sales[0].days_with_sales),
          taxOwed: Number(sales[0].tax_collected),
          dueDate: dueDate.toISOString().split("T")[0],
          status: isCurrent ? "current" : isPast ? "past_due" : "upcoming",
        });
      }
    }

    // Also get YTD totals
    const ytd = await sql`
      SELECT
        COALESCE(SUM(total_revenue), 0) as total_revenue,
        COALESCE(SUM(total_tax), 0) as tax_collected,
        COALESCE(SUM(net_revenue), 0) as net_revenue
      FROM daily_sales
      WHERE restaurant_id = ${restaurantId}
        AND date >= ${`${year}-01-01`} AND date <= ${`${year}-12-31`}
    `;

    // Check expenses table for any sales tax payments already made
    const taxPayments = await sql`
      SELECT COALESCE(SUM(amount), 0) as total_paid
      FROM expenses
      WHERE restaurant_id = ${restaurantId}
        AND category_id = 'cat-sales-tax'
        AND date >= ${`${year}-01-01`} AND date <= ${`${year}-12-31`}
    `;

    return NextResponse.json({
      settings: {
        taxRate,
        state,
        county: settings[0]?.county || null,
        filingFrequency,
      },
      yearToDate: {
        totalRevenue: Number(ytd[0].total_revenue),
        taxCollected: Number(ytd[0].tax_collected),
        taxPaid: Number(taxPayments[0].total_paid),
        taxOwed:
          Number(ytd[0].tax_collected) - Number(taxPayments[0].total_paid),
      },
      periods,
      year,
    });
  } catch (error: any) {
    console.error("Error fetching tax data:", error);
    return NextResponse.json(
      { error: "Failed to load tax data" },
      { status: 500 }
    );
  }
}
