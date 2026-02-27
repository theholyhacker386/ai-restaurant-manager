import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { auth } from "@/lib/auth";
import bcrypt from "bcryptjs";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Resolve the current user from either:
 *  1) Auth session (logged-in user), or
 *  2) A setup token (from URL param or request body)
 *
 * Returns { id, name } or null if neither works.
 */
async function resolveUser(
  request: Request,
  bodyToken?: string
): Promise<{ id: string; name: string } | null> {
  // Try auth session first
  const session = await auth();
  if (session?.user?.id) {
    return { id: session.user.id, name: session.user.name || "" };
  }

  // Try token
  const token = bodyToken || new URL(request.url).searchParams.get("token");
  if (!token) return null;

  const sql = getDb();
  const rows = await sql`
    SELECT id, name FROM users
    WHERE setup_token = ${token}
      AND setup_token_expires > NOW()
  `;
  return rows.length > 0 ? { id: rows[0].id, name: rows[0].name || "" } : null;
}

/**
 * GET — load existing onboarding session + validate token
 *
 * Query params: ?token=xxx (optional — falls back to auth session)
 * Returns: { userId, userName, sessionData, conversationHistory, progress }
 */
export async function GET(request: Request) {
  try {
    const user = await resolveUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated and no valid token" },
        { status: 401 }
      );
    }

    const sql = getDb();
    const rows = await sql`
      SELECT * FROM onboarding_sessions WHERE id = ${user.id}
    `;

    if (rows.length === 0) {
      // No session yet — return user info so the page can start fresh
      return NextResponse.json({
        userId: user.id,
        userName: user.name,
        sessionData: null,
        conversationHistory: [],
        progress: 0,
      });
    }

    const s = rows[0];

    // Reconstruct sessionData from stored columns
    const storedMeta = (s.completed_sections as any) || {};
    const sessionData = {
      businessInfo: s.business_name
        ? { name: s.business_name, type: s.business_type || "", tenure: storedMeta.tenure || "" }
        : null,
      suppliers: storedMeta.suppliers || [],
      menuItems: (s.menu_items as any[]) || [],
      ingredients: (s.ingredients as any[]) || [],
      targets: storedMeta.targets || null,
      pinSet: storedMeta.pinSet || false,
      pinValue: "", // never send back the actual PIN
      progress: s.progress || 0,
    };

    return NextResponse.json({
      userId: user.id,
      userName: s.customer_name || user.name,
      sessionData,
      conversationHistory: (s.conversation_history as any[]) || [],
      progress: s.progress || 0,
    });
  } catch (error: any) {
    console.error("Error loading onboarding session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to load session" },
      { status: 500 }
    );
  }
}

/**
 * PUT — save onboarding session progress mid-conversation
 *
 * Body: { token?, sessionData, conversationHistory, progress }
 */
export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { token: bodyToken, sessionData, conversationHistory, progress } = body;

    const user = await resolveUser(request, bodyToken);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated and no valid token" },
        { status: 401 }
      );
    }

    const sql = getDb();

    // Build storable meta (suppliers, targets, tenure, etc.)
    const meta = {
      suppliers: sessionData?.suppliers || [],
      targets: sessionData?.targets || null,
      tenure: sessionData?.businessInfo?.tenure || "",
      pinSet: sessionData?.pinSet || false,
    };

    await sql`
      INSERT INTO onboarding_sessions (
        id, business_name, business_type, customer_name,
        menu_items, ingredients, completed_sections,
        conversation_history, progress, is_complete
      ) VALUES (
        ${user.id},
        ${sessionData?.businessInfo?.name || null},
        ${sessionData?.businessInfo?.type || null},
        ${user.name || null},
        ${JSON.stringify(sessionData?.menuItems || [])},
        ${JSON.stringify(sessionData?.ingredients || [])},
        ${JSON.stringify(meta)},
        ${JSON.stringify(conversationHistory || [])},
        ${progress || 0},
        false
      )
      ON CONFLICT (id) DO UPDATE SET
        business_name = COALESCE(${sessionData?.businessInfo?.name || null}, onboarding_sessions.business_name),
        business_type = COALESCE(${sessionData?.businessInfo?.type || null}, onboarding_sessions.business_type),
        menu_items = ${JSON.stringify(sessionData?.menuItems || [])},
        ingredients = ${JSON.stringify(sessionData?.ingredients || [])},
        completed_sections = ${JSON.stringify(meta)},
        conversation_history = ${JSON.stringify(conversationHistory || [])},
        progress = ${progress || 0},
        updated_at = NOW()
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error saving onboarding session:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save session" },
      { status: 500 }
    );
  }
}

/**
 * POST — mark onboarding as complete
 *
 * Body: { token?, restaurantName, ownerName, restaurantType, tenure }
 * Clears the setup token and marks onboarding_completed = true.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token: bodyToken, restaurantName, ownerName, restaurantType } = body;

    const user = await resolveUser(request, bodyToken);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated and no valid token" },
        { status: 401 }
      );
    }

    const sql = getDb();

    // Update the onboarding_sessions record
    await sql`
      INSERT INTO onboarding_sessions (id, business_name, business_type, customer_name, is_complete)
      VALUES (${user.id}, ${restaurantName || null}, ${restaurantType || null}, ${ownerName || null}, true)
      ON CONFLICT (id) DO UPDATE SET
        business_name = COALESCE(${restaurantName || null}, onboarding_sessions.business_name),
        business_type = COALESCE(${restaurantType || null}, onboarding_sessions.business_type),
        customer_name = COALESCE(${ownerName || null}, onboarding_sessions.customer_name),
        is_complete = true,
        updated_at = NOW()
    `;

    // Mark onboarding complete and clear the setup token
    await sql`
      UPDATE users
      SET onboarding_completed = true,
          setup_token = NULL,
          setup_token_expires = NULL
      WHERE id = ${user.id}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error completing onboarding:", error);
    return NextResponse.json(
      { error: error.message || "Failed to complete onboarding" },
      { status: 500 }
    );
  }
}

/**
 * PATCH — save PIN during onboarding (without clearing the setup token)
 *
 * Body: { action: "save-pin", pin, token? }
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { action, pin, token: bodyToken } = body;

    if (action !== "save-pin") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    if (!pin || !/^\d{4,6}$/.test(pin)) {
      return NextResponse.json({ error: "PIN must be 4-6 digits" }, { status: 400 });
    }

    const user = await resolveUser(request, bodyToken);
    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated and no valid token" },
        { status: 401 }
      );
    }

    const sql = getDb();

    // Check PIN isn't already taken by someone else
    const usersWithPins = await sql`
      SELECT id, pin_hash FROM users WHERE pin_hash IS NOT NULL AND id != ${user.id}
    `;
    for (const u of usersWithPins) {
      const match = await bcrypt.compare(pin, u.pin_hash);
      if (match) {
        return NextResponse.json(
          { error: "This PIN is already taken. Choose a different one." },
          { status: 409 }
        );
      }
    }

    const pinHash = await bcrypt.hash(pin, 10);
    await sql`
      UPDATE users SET pin = ${pin}, pin_hash = ${pinHash} WHERE id = ${user.id}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error saving PIN:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save PIN" },
      { status: 500 }
    );
  }
}
