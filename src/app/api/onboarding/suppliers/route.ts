import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST — bulk-save suppliers during onboarding.
 * Inserts new supplier names into the suppliers table (skips duplicates).
 */
export async function POST(request: Request) {
  try {
    const { suppliers } = await request.json();

    if (!Array.isArray(suppliers) || suppliers.length === 0) {
      return NextResponse.json({ error: "No suppliers provided" }, { status: 400 });
    }

    const sql = getDb();
    let saved = 0;

    for (const name of suppliers) {
      const trimmed = (name || "").trim();
      if (!trimmed) continue;

      try {
        const id = `sup_${uuid().split("-")[0]}`;
        await sql`
          INSERT INTO suppliers (id, name)
          VALUES (${id}, ${trimmed})
          ON CONFLICT (name) DO NOTHING
        `;
        saved++;
      } catch {
        // Duplicate or error — skip
      }
    }

    return NextResponse.json({ success: true, saved });
  } catch (error: any) {
    console.error("Error saving suppliers:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save suppliers" },
      { status: 500 }
    );
  }
}

/**
 * GET — list all saved suppliers (from both suppliers table and ingredients table).
 */
export async function GET() {
  try {
    const sql = getDb();

    // Get from dedicated suppliers table
    const tableSuppliers = await sql`SELECT name FROM suppliers ORDER BY name`;

    // Get from ingredients table
    const ingredientSuppliers = await sql`
      SELECT DISTINCT supplier as name FROM ingredients
      WHERE supplier IS NOT NULL AND supplier != ''
    `;

    // Merge and deduplicate
    const allNames = new Set<string>();
    for (const row of [...tableSuppliers, ...ingredientSuppliers]) {
      allNames.add(row.name);
    }

    const suppliers = Array.from(allNames).sort();
    return NextResponse.json({ suppliers });
  } catch (error: any) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch suppliers" },
      { status: 500 }
    );
  }
}
