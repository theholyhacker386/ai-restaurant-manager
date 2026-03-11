import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * GET /api/supplier-directory?q=wal
 * Search the shared supplier directory for autocomplete.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q")?.trim();

    const sql = neon(process.env.NEON_DATABASE_URL!);

    let rows;
    if (query && query.length > 0) {
      rows = await sql`
        SELECT id, name, website_url, auto_fetchable, usage_count
        FROM supplier_directory
        WHERE LOWER(name) LIKE ${"%" + query.toLowerCase() + "%"}
        ORDER BY usage_count DESC
        LIMIT 20
      `;
    } else {
      rows = await sql`
        SELECT id, name, website_url, auto_fetchable, usage_count
        FROM supplier_directory
        ORDER BY usage_count DESC
        LIMIT 20
      `;
    }

    return NextResponse.json({ suppliers: rows });
  } catch (error) {
    console.error("Supplier directory search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}

/**
 * POST /api/supplier-directory
 * Add or update a supplier in the shared directory.
 * Body: { name: string, website_url?: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, website_url } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);

    const rows = await sql`
      INSERT INTO supplier_directory (name, website_url)
      VALUES (${name.trim()}, ${website_url || null})
      ON CONFLICT (name) DO UPDATE SET usage_count = supplier_directory.usage_count + 1
      RETURNING id, name, website_url, auto_fetchable, usage_count
    `;

    return NextResponse.json({ supplier: rows[0] });
  } catch (error) {
    console.error("Supplier directory upsert error:", error);
    return NextResponse.json({ error: "Failed to save supplier" }, { status: 500 });
  }
}
