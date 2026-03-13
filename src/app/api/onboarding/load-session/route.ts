import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST — Load a saved onboarding session by userId.
 * Returns session data so the chat can resume where they left off.
 */
export async function POST(request: Request) {
  try {
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const sql = neon(process.env.NEON_DATABASE_URL!);

    // Get session data
    const sessions = await sql`
      SELECT business_name, business_type, customer_name, menu_items, ingredients,
             completed_sections, conversation_history, progress, categories,
             business_hours, targets, suppliers
      FROM onboarding_sessions
      WHERE id = ${userId}
    `;

    if (sessions.length === 0) {
      return NextResponse.json({ session: null });
    }

    const s = sessions[0];

    // Get user info
    const users = await sql`
      SELECT name, email FROM users WHERE id = ${userId}
    `;
    const user = users[0] || {};

    // Check if Square is connected (from completed_sections, linked tokens, or pending tokens)
    const completedSections = s.completed_sections || {};
    const squareFromSections = completedSections.square === true || completedSections.squareConnected === true;
    let squareConnected = squareFromSections;
    if (!squareConnected) {
      const userRows = await sql`SELECT restaurant_id FROM users WHERE id = ${userId}`;
      const restId = userRows[0]?.restaurant_id;
      if (restId) {
        const linkedTokens = await sql`SELECT id FROM square_tokens WHERE restaurant_id = ${restId} LIMIT 1`;
        squareConnected = linkedTokens.length > 0;
      }
      if (!squareConnected) {
        const squareTokens = await sql`SELECT id FROM pending_square_tokens LIMIT 1`;
        squareConnected = squareTokens.length > 0;
      }
    }

    // Check if bank is connected
    const plaidItems = await sql`
      SELECT id FROM plaid_items WHERE restaurant_id = (
        SELECT restaurant_id FROM users WHERE id = ${userId}
      ) AND status = 'active' LIMIT 1
    `;
    const bankConnected = plaidItems.length > 0;

    return NextResponse.json({
      session: {
        businessInfo: s.business_name ? {
          name: s.business_name,
          type: s.business_type,
        } : null,
        userName: s.customer_name || user.name || null,
        menuItems: s.menu_items || [],
        ingredients: s.ingredients || [],
        suppliers: s.suppliers || [],
        categories: s.categories || [],
        businessHours: s.business_hours || null,
        targets: s.targets || null,
        completedSections: s.completed_sections || {},
        conversationHistory: s.conversation_history || [],
        progress: s.progress || 0,
        squareConnected,
        bankConnected,
      },
    });
  } catch (error: any) {
    console.error("Load session error:", error);
    return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
  }
}
