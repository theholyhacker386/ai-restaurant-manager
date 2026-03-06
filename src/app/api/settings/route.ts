import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";
import { getSettings } from "@/lib/settings";
import { auth } from "@/lib/auth";
import { logAuditEvent, getRequestMeta } from "@/lib/audit";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Ensure tax-related columns exist (safe to run repeatedly)
async function ensureTaxColumns(sql: any) {
  await sql`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS sales_tax_rate DECIMAL`;
  await sql`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS state TEXT`;
  await sql`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS county TEXT`;
  await sql`ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS tax_filing_frequency TEXT DEFAULT 'quarterly'`;
}

// GET — return current business settings
export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();

    // Make sure tax columns exist
    await ensureTaxColumns(sql);

    const rows = await sql`SELECT * FROM business_settings WHERE restaurant_id = ${restaurantId}`;

    if (rows.length === 0) {
      // Fall back to defaults via getSettings (which also checks restaurant_id)
      const defaults = await getSettings(restaurantId);
      return NextResponse.json({ settings: defaults });
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
        sales_tax_rate: row.sales_tax_rate != null ? Number(row.sales_tax_rate) : null,
        state: row.state || null,
        county: row.county || null,
        tax_filing_frequency: row.tax_filing_frequency || "quarterly",
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
    const { sql, restaurantId } = await getTenantDb();
    const body = await request.json();

    // Make sure tax columns exist before updating
    await ensureTaxColumns(sql);

    // If this is a tax-only update (from the tax dashboard), only update tax fields
    if (body._taxSettingsOnly) {
      await sql`
        UPDATE business_settings SET
          sales_tax_rate = ${body.sales_tax_rate ?? null},
          state = ${body.state ?? null},
          county = ${body.county ?? null},
          tax_filing_frequency = ${body.tax_filing_frequency ?? 'quarterly'},
          updated_at = NOW()
        WHERE restaurant_id = ${restaurantId}
      `;
    } else {
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
          sales_tax_rate = ${body.sales_tax_rate ?? null},
          state = ${body.state ?? null},
          county = ${body.county ?? null},
          tax_filing_frequency = ${body.tax_filing_frequency ?? 'quarterly'},
          updated_at = NOW()
        WHERE restaurant_id = ${restaurantId}
      `;
    }

    // Audit log: settings changed
    const session = await auth();
    const { ipAddress, userAgent } = getRequestMeta(request);
    logAuditEvent({
      eventType: "settings_changed",
      userId: session?.user?.id,
      userEmail: session?.user?.email || undefined,
      userRole: (session?.user as any)?.role,
      restaurantId,
      ipAddress,
      userAgent,
      resource: "/api/settings",
      details: {
        food_cost_target: body.food_cost_target,
        food_cost_warning: body.food_cost_warning,
        rplh_target: body.rplh_target,
        labor_cost_target: body.labor_cost_target,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error saving settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
