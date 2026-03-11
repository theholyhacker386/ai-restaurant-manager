import { NextResponse } from "next/server";
import { checkMultipleSuppliers, lookupPrice } from "@/lib/supplier-prices";

/**
 * POST /api/supplier-prices
 * Check which suppliers have public prices available.
 * Body: { suppliers: string[] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { suppliers } = body;

    if (!Array.isArray(suppliers) || suppliers.length === 0) {
      return NextResponse.json({ error: "suppliers array is required" }, { status: 400 });
    }

    // Limit to 20 suppliers at once
    const limited = suppliers.slice(0, 20).map((name: string) => ({ name }));

    const results = await checkMultipleSuppliers(limited);

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Supplier price check error:", error);
    return NextResponse.json(
      { error: "Failed to check suppliers" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/supplier-prices?supplier=Walmart&ingredient=milk
 * Look up a specific ingredient price from a supplier.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const supplier = searchParams.get("supplier");
    const ingredient = searchParams.get("ingredient");

    if (!supplier || !ingredient) {
      return NextResponse.json(
        { error: "supplier and ingredient params required" },
        { status: 400 }
      );
    }

    const result = await lookupPrice(supplier, ingredient);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Price lookup error:", error);
    return NextResponse.json(
      { error: "Failed to look up price" },
      { status: 500 }
    );
  }
}
