import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";

// GET - list expenses with optional date range
export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const categoryId = searchParams.get("categoryId");
    const categoryType = searchParams.get("categoryType");

    let expenses;
    if (startDate && endDate && categoryId) {
      expenses = await sql`
        SELECT e.*, ec.name as category_name, ec.type as category_type
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        WHERE e.date >= ${startDate} AND e.date <= ${endDate} AND e.category_id = ${categoryId}
        ORDER BY e.date DESC, e.created_at DESC`;
    } else if (startDate && endDate && categoryType) {
      expenses = await sql`
        SELECT e.*, ec.name as category_name, ec.type as category_type
        FROM expenses e
        JOIN expense_categories ec ON e.category_id = ec.id
        WHERE e.date >= ${startDate} AND e.date <= ${endDate} AND ec.type = ${categoryType}
        ORDER BY e.date DESC, e.created_at DESC`;
    } else if (startDate && endDate) {
      expenses = await sql`
        SELECT e.*, ec.name as category_name, ec.type as category_type
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        WHERE e.date >= ${startDate} AND e.date <= ${endDate}
        ORDER BY e.date DESC, e.created_at DESC`;
    } else {
      expenses = await sql`
        SELECT e.*, ec.name as category_name, ec.type as category_type
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        ORDER BY e.date DESC, e.created_at DESC`;
    }

    const categories = await sql`SELECT * FROM expense_categories ORDER BY name`;

    let totalsByType;
    if (startDate && endDate) {
      totalsByType = await sql`
        SELECT COALESCE(ec.type, 'uncategorized') as type, COALESCE(SUM(e.amount), 0) as total
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        WHERE e.date >= ${startDate} AND e.date <= ${endDate}
        GROUP BY ec.type`;
    } else {
      totalsByType = await sql`
        SELECT COALESCE(ec.type, 'uncategorized') as type, COALESCE(SUM(e.amount), 0) as total
        FROM expenses e
        LEFT JOIN expense_categories ec ON e.category_id = ec.id
        GROUP BY ec.type`;
    }

    return NextResponse.json({ expenses, categories, totalsByType });
  } catch (error: unknown) {
    console.error("Error fetching expenses:", error);
    return NextResponse.json(
      { error: "Failed to fetch expenses" },
      { status: 500 }
    );
  }
}

// POST - create a new expense
export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    const body = await request.json();

    const { category_id, description, amount, date, is_recurring, recurring_frequency, notes } = body;

    if (!description || !amount || !date) {
      return NextResponse.json(
        { error: "Description, amount, and date are required" },
        { status: 400 }
      );
    }

    const id = uuid();

    await sql`INSERT INTO expenses (id, category_id, description, amount, date, is_recurring, recurring_frequency, source, notes)
       VALUES (${id}, ${category_id || null}, ${description}, ${amount}, ${date}, ${is_recurring ? true : false}, ${recurring_frequency || null}, 'manual', ${notes || null})`;

    return NextResponse.json({ id, description, amount, date });
  } catch (error: unknown) {
    console.error("Error creating expense:", error);
    return NextResponse.json(
      { error: "Failed to create expense" },
      { status: 500 }
    );
  }
}

// DELETE - remove an expense
export async function DELETE(request: NextRequest) {
  try {
    const sql = getDb();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Expense ID is required" },
        { status: 400 }
      );
    }

    await sql`DELETE FROM expenses WHERE id = ${id}`;

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error("Error deleting expense:", error);
    return NextResponse.json(
      { error: "Failed to delete expense" },
      { status: 500 }
    );
  }
}
