# AI-1: Chat API Endpoint with OpenAI Function Calling

AGENT_ROLE: builder
PROJECT: porch-financial

## Task
Build the core chat API endpoint that powers the AI Assistant Manager. This endpoint receives a user message, sends it to OpenAI GPT-4o with function/tool definitions, executes any tool calls against the existing API logic, and streams the response back.

## Context
- Spec: `.project/architect/features/ai-assistant-manager.md`
- Existing OpenAI setup: `src/lib/openai.ts` (already has OpenAI client)
- Existing DB: `src/lib/db.ts` (SQLite with better-sqlite3)
- Package: `openai` v6.22.0 already installed

## What to Build

### 1. Tool Definitions (`src/lib/assistant-tools.ts`)
Define all OpenAI function calling tools. These are the JSON schemas that tell OpenAI what functions the AI can call. Start with these core tools:

**Menu tools:**
- `add_menu_item` — params: name (string, required), selling_price (number, required), category_name (string, optional)
- `list_menu_items` — no required params
- `get_menu_item_details` — params: menu_item_id (string) OR name (string)
- `update_menu_item` — params: menu_item_id (string), name (string, optional), selling_price (number, optional)

**Ingredient tools:**
- `add_ingredient` — params: name, unit, cost_per_unit, supplier (optional), package_size (optional), package_unit (optional), package_price (optional)
- `search_ingredients` — params: query (string)
- `update_ingredient_price` — params: ingredient_id (string), cost_per_unit (number), package_price (number, optional)

**Recipe tools:**
- `add_recipe_ingredient` — params: menu_item_name OR menu_item_id, ingredient_name OR ingredient_id, quantity (number), quantity_unit (string)
- `get_recipe` — params: menu_item_name OR menu_item_id

**Expense tools:**
- `add_expense` — params: description (string), amount (number), date (string, default today), category_name (string, optional)

**Analysis tools (read-only):**
- `get_sales_summary` — params: start_date (string, optional), end_date (string, optional), defaults to current month
- `get_profit_and_loss` — params: start_date, end_date
- `get_kpis` — no required params, returns current KPIs
- `get_top_selling_items` — params: start_date (optional), end_date (optional), limit (number, default 10)
- `get_labor_summary` — params: start_date, end_date
- `get_business_recommendations` — no params, analyzes current data and returns improvement suggestions

### 2. Tool Executor (`src/lib/assistant-executor.ts`)
A function that takes a tool name and arguments, executes the corresponding database operation (reuse logic from existing API routes — import `getDb()` and run the same queries), and returns the result.

Important: Do NOT make HTTP calls to the API routes. Instead, import `getDb()` and execute the queries directly. This avoids unnecessary network round-trips and works better in serverless.

### 3. System Prompt (`src/lib/assistant-prompt.ts`)
Build the system prompt dynamically. It should include:
- Role: "You are the AI Assistant Manager for [restaurant name]. You help the owner manage their restaurant by executing actions and analyzing business data."
- Restaurant industry knowledge (30/30/30/10 rule, prime cost benchmarks, food cost targets)
- Instructions to always respond in plain, friendly language
- Instructions to confirm before making changes ("I'll add Chicken Alfredo at $13.99. Sound good?") — actually, for speed, just execute and report. The user can always undo.
- Current date for context
- Brief summary of what data is available

### 4. Chat API Route (`src/app/api/assistant/chat/route.ts`)
- Method: POST
- Request body: `{ message: string, conversationId?: string, history?: Array<{role: string, content: string}> }`
- Uses OpenAI streaming with tool calling
- Response: Streamed text using ReadableStream (Server-Sent Events pattern)
- Stream format: `data: {"type": "text", "content": "..."}\n\n` for text chunks, `data: {"type": "tool_call", "name": "...", "result": {...}}\n\n` for tool executions, `data: {"type": "done"}\n\n` when complete

### 5. Database Tables
Add conversation tables to `src/lib/db.ts` initializeDb():
```sql
CREATE TABLE IF NOT EXISTS assistant_conversations (
  id TEXT PRIMARY KEY,
  started_at TEXT DEFAULT (datetime('now')),
  last_message_at TEXT DEFAULT (datetime('now')),
  summary TEXT
);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  tool_calls TEXT,
  tool_results TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES assistant_conversations(id)
);
```

## Key Patterns to Follow
- Look at `src/app/api/receipts/scan/route.ts` for how OpenAI is currently used
- Look at `src/app/api/menu-items/route.ts` for the menu item creation pattern
- Use `uuid` package (already installed) for ID generation: `import { v4 as uuidv4 } from "uuid"`
- All DB operations use `getDb()` from `src/lib/db.ts`

## Acceptance Criteria
- [ ] POST `/api/assistant/chat` accepts a message and returns streamed response
- [ ] AI can call tools and execute menu item creation against the real database
- [ ] AI can query sales data and return real numbers
- [ ] AI can query P&L data and return real analysis
- [ ] Tool results are streamed as events so the UI can show action cards
- [ ] Conversation messages are saved to the database
- [ ] Error in tool execution is handled gracefully (AI explains what went wrong)
