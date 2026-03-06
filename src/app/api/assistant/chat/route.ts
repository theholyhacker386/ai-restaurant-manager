import { NextRequest } from "next/server";
import OpenAI from "openai";
import { assistantTools } from "@/lib/assistant-tools";
import { buildSystemPrompt } from "@/lib/assistant-prompt";
import { executeTool } from "@/lib/assistant-executor";
import { getTenantDb } from "@/lib/tenant";
import { auth } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Lazy-init OpenAI client (same pattern as receipt scanner)
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

export const runtime = "nodejs";
export const maxDuration = 30; // Vercel streaming timeout

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, history, pageContext, screenshot, conversationId } = body as {
      message: string;
      history?: Array<{ role: "user" | "assistant"; content: string }>;
      pageContext?: {
        url?: string;
        pathname?: string;
        pageTitle?: string;
        viewport?: { width: number; height: number };
        userAgent?: string;
        timestamp?: string;
      };
      screenshot?: string; // data URL of a screenshot
      conversationId?: string;
    };

    // Store screenshot for this request so tool calls can access it
    const requestContext = { screenshot: screenshot || null };

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const openai = getOpenAI();

    // Get user for conversation logging (non-blocking — don't fail if auth unavailable)
    let userId: string | null = null;
    try {
      const session = await auth();
      userId = (session?.user as any)?.id || null;
    } catch { /* proceed without user */ }

    // Get or create conversation
    const { sql, restaurantId } = await getTenantDb();
    let convId = conversationId || null;
    if (!convId) {
      const [conv] = await sql`
        INSERT INTO chat_conversations (user_id, restaurant_id)
        VALUES (${userId || 'unknown'}, ${restaurantId})
        RETURNING id
      ` as any[];
      convId = conv.id;
    }

    // Save user message
    await sql`
      INSERT INTO chat_messages (conversation_id, role, content)
      VALUES (${convId}, 'user', ${message})
    `;
    await sql`
      UPDATE chat_conversations
      SET last_message_at = NOW(), message_count = message_count + 1
      WHERE id = ${convId} AND restaurant_id = ${restaurantId}
    `;

    // Enrich user message with page context so the AI knows where the user is
    let enrichedMessage = message;
    if (pageContext) {
      enrichedMessage += `\n\n[Context: User is on page "${pageContext.pathname || "/"}" (${pageContext.pageTitle || "unknown"}), viewport ${pageContext.viewport?.width || 0}x${pageContext.viewport?.height || 0}, device: ${pageContext.userAgent || "unknown"}]`;
    }

    // Fetch real business hours from the database for the system prompt
    let businessHours: Record<string, { open: string; close: string } | null> | undefined;
    try {
      const settings = await getSettings(restaurantId);
      businessHours = settings.business_hours;
    } catch {
      // Fall back to no hours — the prompt will say "Business hours not set."
    }

    // Build messages array: system prompt + conversation history + new message
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: buildSystemPrompt({ businessHours }) },
      ...(history || []).map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      { role: "user", content: enrichedMessage },
    ];

    // Collect full response for logging
    const responseCollector = { text: "", toolCalls: [] as any[] };

    // Create SSE stream
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send conversation ID to client so it can be reused
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "conversation_id", id: convId })}\n\n`)
          );
          await processConversation(openai, messages, controller, encoder, 0, requestContext, responseCollector, restaurantId);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "error", content: errorMsg })}\n\n`)
          );
        } finally {
          // Save assistant response to database
          try {
            if (responseCollector.text) {
              await sql`
                INSERT INTO chat_messages (conversation_id, role, content)
                VALUES (${convId}, 'assistant', ${responseCollector.text})
              `;
              await sql`
                UPDATE chat_conversations
                SET last_message_at = NOW(), message_count = message_count + 1
                WHERE id = ${convId} AND restaurant_id = ${restaurantId}
              `;
            }
            // Save tool calls
            for (const tc of responseCollector.toolCalls) {
              await sql`
                INSERT INTO chat_messages (conversation_id, role, content, tool_name, tool_args, tool_result)
                VALUES (${convId}, 'tool', ${tc.name}, ${tc.name}, ${JSON.stringify(tc.args)}, ${JSON.stringify(tc.result)})
              `;
            }
          } catch (logErr) {
            console.error("Failed to log chat message:", logErr);
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error: unknown) {
    console.error("Assistant chat error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to process message" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

/**
 * Process a conversation turn, handling tool calls recursively.
 * Uses non-streaming OpenAI calls for reliability with tool calling,
 * then streams the final text response to the client.
 */
async function processConversation(
  openai: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  depth = 0,
  requestContext: { screenshot: string | null } = { screenshot: null },
  responseCollector: { text: string; toolCalls: any[] } = { text: "", toolCalls: [] },
  restaurantId?: string
) {
  // Safety: max 5 tool-call rounds to allow complex multi-step workflows (e.g. inventory: search → add → update stock)
  if (depth > 5) {
    const msg = "I tried several steps but couldn't complete the request. Could you try rephrasing?";
    responseCollector.text += msg;
    controller.enqueue(
      encoder.encode(
        `data: ${JSON.stringify({ type: "text", content: msg })}\n\n`
      )
    );
    return;
  }

  // Retry with backoff if rate limited
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools: assistantTools,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 2048,
      });
      break;
    } catch (err: unknown) {
      const isRateLimit = err instanceof Error && (err.message.includes("429") || err.message.includes("rate_limit"));
      if (isRateLimit && attempt < 2) {
        const waitSec = (attempt + 1) * 15;
        console.log(`[assistant] Rate limited, waiting ${waitSec}s (attempt ${attempt + 2}/3)...`);
        await new Promise((r) => setTimeout(r, waitSec * 1000));
        continue;
      }
      throw err;
    }
  }
  if (!response) throw new Error("Failed after retries");

  const choice = response.choices[0];
  const assistantMessage = choice.message;

  // If the AI wants to call tools
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    // Add assistant message with tool calls to history
    messages.push(assistantMessage);

    // Execute each tool call
    for (const toolCall of assistantMessage.tool_calls) {
      // Only handle function-type tool calls
      if (toolCall.type !== "function") continue;
      const toolName = toolCall.function.name;
      let toolArgs: Record<string, unknown> = {};

      try {
        toolArgs = JSON.parse(toolCall.function.arguments);
      } catch {
        toolArgs = {};
      }

      // Notify client that a tool is being called
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "tool_start", name: toolName })}\n\n`
        )
      );

      // Execute the tool (pass screenshot context for issue reports)
      const result = await executeTool(toolName, toolArgs, requestContext.screenshot, restaurantId);

      // Log tool call
      responseCollector.toolCalls.push({ name: toolName, args: toolArgs, result: result.data || result.error });

      // Send action card if present
      if (result.actionCard) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "tool_call", name: toolName, actionCard: result.actionCard })}\n\n`
          )
        );
      }

      // Add tool result to messages for the AI to use
      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result.data || result.error || "Done"),
      });
    }

    // Recurse: let the AI generate a response using the tool results
    await processConversation(openai, messages, controller, encoder, depth + 1, requestContext, responseCollector, restaurantId);
    return;
  }

  // No tool calls — stream the text response
  if (assistantMessage.content) {
    // Collect for logging
    responseCollector.text += assistantMessage.content;

    // Stream character-by-character for a typing effect
    const text = assistantMessage.content;
    const chunkSize = 3; // Send 3 chars at a time for smooth streaming
    for (let i = 0; i < text.length; i += chunkSize) {
      const chunk = text.slice(i, i + chunkSize);
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "text", content: chunk })}\n\n`)
      );
      // Tiny delay for typing effect (only in longer responses)
      if (text.length > 100) {
        await new Promise((r) => setTimeout(r, 10));
      }
    }
  }
}
