import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET — return all ingredients with stock info
export async function GET() {
  try {
    const sql = getDb();

    const ingredients = await sql`
      SELECT
        id, name, unit, supplier, ingredient_type,
        package_size, package_unit, package_price,
        current_stock, par_level, reorder_point,
        stock_counted_at, cost_per_unit
      FROM ingredients
      WHERE ingredient_type != 'sub_recipe'
      ORDER BY
        CASE ingredient_type WHEN 'food' THEN 0 ELSE 1 END,
        name
    `;

    return NextResponse.json({ ingredients });
  } catch (error: any) {
    console.error("Error fetching inventory stock:", error);
    return NextResponse.json(
      { error: "Failed to fetch inventory" },
      { status: 500 }
    );
  }
}

// PATCH — update stock count (and optionally par_level / reorder_point)
export async function PATCH(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();

    const { updates } = body as {
      updates: Array<{
        id: string;
        current_stock: number;
        par_level?: number;
        reorder_point?: number;
      }>;
    };

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "Must provide an updates array" },
        { status: 400 }
      );
    }

    const results: any[] = [];

    for (const u of updates) {
      if (!u.id || u.current_stock === undefined) {
        results.push({ id: u.id, success: false, error: "Missing id or current_stock" });
        continue;
      }

      if (u.par_level !== undefined && u.reorder_point !== undefined) {
        await sql`
          UPDATE ingredients
          SET current_stock = ${u.current_stock},
              par_level = ${u.par_level},
              reorder_point = ${u.reorder_point},
              stock_counted_at = NOW(),
              updated_at = NOW()
          WHERE id = ${u.id}
        `;
      } else if (u.par_level !== undefined) {
        await sql`
          UPDATE ingredients
          SET current_stock = ${u.current_stock},
              par_level = ${u.par_level},
              stock_counted_at = NOW(),
              updated_at = NOW()
          WHERE id = ${u.id}
        `;
      } else if (u.reorder_point !== undefined) {
        await sql`
          UPDATE ingredients
          SET current_stock = ${u.current_stock},
              reorder_point = ${u.reorder_point},
              stock_counted_at = NOW(),
              updated_at = NOW()
          WHERE id = ${u.id}
        `;
      } else {
        await sql`
          UPDATE ingredients
          SET current_stock = ${u.current_stock},
              stock_counted_at = NOW(),
              updated_at = NOW()
          WHERE id = ${u.id}
        `;
      }

      results.push({ id: u.id, success: true });
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("Error updating inventory stock:", error);
    return NextResponse.json(
      { error: "Failed to update stock" },
      { status: 500 }
    );
  }
}
