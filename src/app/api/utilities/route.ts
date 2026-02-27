import { NextRequest, NextResponse } from "next/server";
import { getTenantDb } from "@/lib/tenant";

export async function GET() {
  try {
    const { sql, restaurantId } = await getTenantDb();

    const bills = await sql`
      SELECT * FROM utility_bills
      WHERE restaurant_id = ${restaurantId}
      ORDER BY bill_date DESC
    ` as any[];

    // Group by utility type and calculate projections
    const byType: Record<string, any[]> = {};
    for (const bill of bills) {
      if (!byType[bill.utility_type]) byType[bill.utility_type] = [];
      byType[bill.utility_type].push(bill);
    }

    const projections: Record<string, any> = {};
    for (const [type, typeBills] of Object.entries(byType)) {
      const sorted = typeBills.sort((a, b) => a.bill_date.localeCompare(b.bill_date));
      const last12 = sorted.slice(-12);

      const avgAmount = last12.reduce((s: number, b: any) => s + b.amount, 0) / last12.length;
      const avgUsage = last12.filter((b: any) => b.usage_qty).reduce((s: number, b: any) => s + b.usage_qty, 0) / (last12.filter((b: any) => b.usage_qty).length || 1);
      const latestRate = last12.filter((b: any) => b.rate_per_unit).slice(-1)[0]?.rate_per_unit || 0;

      const halfIdx = Math.floor(last12.length / 2);
      const firstHalf = last12.slice(0, halfIdx).filter((b: any) => b.rate_per_unit);
      const secondHalf = last12.slice(halfIdx).filter((b: any) => b.rate_per_unit);
      const firstAvgRate = firstHalf.length > 0 ? firstHalf.reduce((s: number, b: any) => s + b.rate_per_unit, 0) / firstHalf.length : 0;
      const secondAvgRate = secondHalf.length > 0 ? secondHalf.reduce((s: number, b: any) => s + b.rate_per_unit, 0) / secondHalf.length : 0;
      const rateChange = firstAvgRate > 0 ? ((secondAvgRate - firstAvgRate) / firstAvgRate) * 100 : 0;

      const annualProjection = avgAmount * 12 * (1 + rateChange / 100);

      projections[type] = {
        avgMonthly: Math.round(avgAmount * 100) / 100,
        avgUsage: Math.round(avgUsage * 10) / 10,
        latestRate: Math.round(latestRate * 10000) / 10000,
        rateChange: Math.round(rateChange * 10) / 10,
        annualProjection: Math.round(annualProjection),
        monthsOfData: last12.length,
      };
    }

    return NextResponse.json({ bills, projections });
  } catch (error) {
    console.error("Utilities fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch utilities" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sql, restaurantId } = await getTenantDb();
    const body = await request.json();
    const { utilityType, billDate, amount, usageQty, usageUnit, ratePerUnit, notes } = body;

    if (!billDate || !amount) {
      return NextResponse.json({ error: "Date and amount are required" }, { status: 400 });
    }

    const id = `util-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    await sql`INSERT INTO utility_bills (id, utility_type, bill_date, amount, usage_qty, usage_unit, rate_per_unit, notes, restaurant_id)
      VALUES (${id}, ${utilityType || "electric"}, ${billDate}, ${amount}, ${usageQty || null}, ${usageUnit || "kWh"}, ${ratePerUnit || null}, ${notes || null}, ${restaurantId})`;

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Utility bill create error:", error);
    return NextResponse.json({ error: "Failed to add bill" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  try {
    const { sql, restaurantId } = await getTenantDb();
    await sql`DELETE FROM utility_bills WHERE id = ${id} AND restaurant_id = ${restaurantId}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Utility bill delete error:", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
