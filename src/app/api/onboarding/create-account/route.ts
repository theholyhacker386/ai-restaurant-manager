import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import bcrypt from "bcryptjs";
import crypto from "crypto";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * POST — Silently create an account during onboarding chat.
 *
 * Body: { email, name, tempSessionId }
 *
 * Returns:
 *   - { status: "created", userId, autoLoginToken } — new user created
 *   - { status: "exists_incomplete", userId } — existing user, onboarding not done (resume)
 *   - { status: "exists_complete" } — existing user already finished onboarding (go log in)
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, name, tempSessionId } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const sql = getDb();

    // Check if user already exists
    const existing = await sql`
      SELECT id, onboarding_completed FROM users WHERE email = ${normalizedEmail}
    `;

    if (existing.length > 0) {
      const user = existing[0];
      if (user.onboarding_completed) {
        return NextResponse.json({ status: "exists_complete" });
      }
      // Existing user with incomplete onboarding — let them resume
      // Migrate anonymous session data if we have a tempSessionId
      if (tempSessionId) {
        await migrateAnonSession(sql, tempSessionId, user.id);
      }
      return NextResponse.json({ status: "exists_incomplete", userId: user.id });
    }

    // Create new user with a random password (they'll log in via auto-login token or PIN)
    const randomPassword = crypto.randomBytes(32).toString("hex");
    const passwordHash = await bcrypt.hash(randomPassword, 10);

    // Generate one-time auto-login token (expires in 1 hour)
    const autoLoginToken = crypto.randomBytes(48).toString("hex");
    const tokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Create restaurant first
    const restaurantRows = await sql`
      INSERT INTO restaurants (name, type, created_at, updated_at)
      VALUES (${name || "My Restaurant"}, null, NOW(), NOW())
      RETURNING id
    `;
    const restaurantId = restaurantRows[0]?.id;

    // Create user
    const userRows = await sql`
      INSERT INTO users (email, password_hash, name, role, onboarding_completed, restaurant_id, auto_login_token, auto_login_token_expires, created_at, updated_at)
      VALUES (${normalizedEmail}, ${passwordHash}, ${name || null}, 'owner', false, ${restaurantId}, ${autoLoginToken}, ${tokenExpires.toISOString()}, NOW(), NOW())
      RETURNING id
    `;
    const userId = userRows[0]?.id;

    // Migrate anonymous session data if we have a tempSessionId
    if (tempSessionId && userId) {
      await migrateAnonSession(sql, tempSessionId, userId);
    }

    return NextResponse.json({
      status: "created",
      userId,
      autoLoginToken,
    });
  } catch (error: any) {
    console.error("Create account error:", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}

/**
 * Migrate anonymous onboarding session data (stored under tempSessionId) to a real user ID.
 */
async function migrateAnonSession(sql: any, tempSessionId: string, userId: string) {
  try {
    // Check if there's an anonymous session stored under the temp ID
    const anonRows = await sql`
      SELECT * FROM onboarding_sessions WHERE id = ${tempSessionId}
    `;
    if (anonRows.length === 0) return;

    const anon = anonRows[0];

    // Upsert into the real user's session
    await sql`
      INSERT INTO onboarding_sessions (
        id, business_name, business_type, customer_name,
        menu_items, ingredients, completed_sections,
        conversation_history, progress, is_complete, restaurant_id
      ) VALUES (
        ${userId},
        ${anon.business_name},
        ${anon.business_type},
        ${anon.customer_name},
        ${JSON.stringify(anon.menu_items || [])},
        ${JSON.stringify(anon.ingredients || [])},
        ${JSON.stringify(anon.completed_sections || {})},
        ${JSON.stringify(anon.conversation_history || [])},
        ${anon.progress || 0},
        false,
        ${anon.restaurant_id}
      )
      ON CONFLICT (id) DO UPDATE SET
        business_name = COALESCE(${anon.business_name}, onboarding_sessions.business_name),
        business_type = COALESCE(${anon.business_type}, onboarding_sessions.business_type),
        customer_name = COALESCE(${anon.customer_name}, onboarding_sessions.customer_name),
        menu_items = ${JSON.stringify(anon.menu_items || [])},
        ingredients = ${JSON.stringify(anon.ingredients || [])},
        completed_sections = ${JSON.stringify(anon.completed_sections || {})},
        conversation_history = ${JSON.stringify(anon.conversation_history || [])},
        progress = ${anon.progress || 0},
        updated_at = NOW()
    `;

    // Delete the anonymous session
    await sql`DELETE FROM onboarding_sessions WHERE id = ${tempSessionId}`;
  } catch (err) {
    console.error("Error migrating anonymous session:", err);
  }
}
