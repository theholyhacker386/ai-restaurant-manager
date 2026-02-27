import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { auth } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/assistant/conversations
 * List recent conversations, optionally filtered by user or reviewed status.
 * Query params: ?user_id=X &reviewed=false &limit=20
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "owner") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    const reviewed = searchParams.get("reviewed");
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);
    const withMessages = searchParams.get("messages") === "true";
    const conversationId = searchParams.get("id");

    const sql = getDb();

    // Single conversation with all messages
    if (conversationId) {
      const [conv] = await sql`
        SELECT c.*, u.name as user_name, u.email as user_email
        FROM chat_conversations c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.id = ${conversationId}
      ` as any[];
      if (!conv) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
      const messages = await sql`
        SELECT id, role, content, tool_name, tool_args, tool_result, created_at
        FROM chat_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY created_at
      ` as any[];
      return NextResponse.json({ conversation: conv, messages });
    }

    // List conversations
    let conversations;
    if (userId && reviewed !== null) {
      conversations = await sql`
        SELECT c.*, u.name as user_name, u.email as user_email
        FROM chat_conversations c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.user_id = ${userId} AND c.reviewed = ${reviewed === "true"}
        ORDER BY c.last_message_at DESC LIMIT ${limit}
      ` as any[];
    } else if (userId) {
      conversations = await sql`
        SELECT c.*, u.name as user_name, u.email as user_email
        FROM chat_conversations c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.user_id = ${userId}
        ORDER BY c.last_message_at DESC LIMIT ${limit}
      ` as any[];
    } else if (reviewed !== null) {
      conversations = await sql`
        SELECT c.*, u.name as user_name, u.email as user_email
        FROM chat_conversations c
        LEFT JOIN users u ON u.id = c.user_id
        WHERE c.reviewed = ${reviewed === "true"}
        ORDER BY c.last_message_at DESC LIMIT ${limit}
      ` as any[];
    } else {
      conversations = await sql`
        SELECT c.*, u.name as user_name, u.email as user_email
        FROM chat_conversations c
        LEFT JOIN users u ON u.id = c.user_id
        ORDER BY c.last_message_at DESC LIMIT ${limit}
      ` as any[];
    }

    // Optionally include messages inline
    if (withMessages) {
      for (const conv of conversations) {
        conv.messages = await sql`
          SELECT id, role, content, tool_name, tool_args, tool_result, created_at
          FROM chat_messages
          WHERE conversation_id = ${conv.id}
          ORDER BY created_at
        ` as any[];
      }
    }

    return NextResponse.json({ conversations });
  } catch (error: any) {
    console.error("Conversations API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/assistant/conversations
 * Mark conversations as reviewed with optional notes.
 * Body: { id: "conv-id", reviewed: true, review_notes: "..." }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || (session.user as any).role !== "owner") {
      return NextResponse.json({ error: "Owner access required" }, { status: 403 });
    }

    const { id, reviewed, review_notes } = await request.json();
    if (!id) {
      return NextResponse.json({ error: "Conversation id required" }, { status: 400 });
    }

    const sql = getDb();
    await sql`
      UPDATE chat_conversations
      SET reviewed = ${reviewed ?? true},
          reviewed_at = NOW(),
          review_notes = ${review_notes || null}
      WHERE id = ${id}
    `;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Conversations PATCH error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
