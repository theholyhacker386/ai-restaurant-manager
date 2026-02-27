import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

// GET all menu categories
export async function GET() {
  try {
    const sql = getDb();
    const categories = await sql`SELECT * FROM menu_categories ORDER BY sort_order, name`;
    return NextResponse.json({ categories });
  } catch (error: any) {
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// POST - create a new category
export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();
    const { name, sort_order } = body;

    if (!name) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const id = uuid();
    await sql`INSERT INTO menu_categories (id, name, sort_order) VALUES (${id}, ${name}, ${sort_order || 0})`;

    return NextResponse.json({ id, name });
  } catch (error: any) {
    console.error("Error creating category:", error);
    return NextResponse.json(
      { error: "Failed to create category" },
      { status: 500 }
    );
  }
}
