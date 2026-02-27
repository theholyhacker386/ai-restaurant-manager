# AI Assistant Manager

## Purpose
Add a voice-powered AI assistant to the Porch Financial platform that restaurant owners can talk to naturally — like having a smart manager on staff 24/7. The assistant can execute actions in the app (add menu items, log expenses), analyze business data, and give intelligent business advice. This is the flagship feature that makes the platform sellable to other restaurant owners.

## Design Approach

### High-Level Architecture

The assistant is a **chat interface with a microphone button** that floats in the bottom-right corner of the app (above the bottom nav). When opened, it slides up into a full chat panel. Users can type OR tap the mic to speak.

```
┌─────────────────────────────┐
│  The Porch Health Park      │  ← Existing header
├─────────────────────────────┤
│                             │
│   [Normal page content]     │
│                             │
│                             │
├─────────────────────────────┤
│  ┌───────────────────────┐  │
│  │ 🤖 Hey! How can I     │  │  ← AI Chat Panel (slides up)
│  │ help today?           │  │
│  │                       │  │
│  │ User: Add a new menu  │  │
│  │ item called Chicken   │  │
│  │ Pesto for $13.99      │  │
│  │                       │  │
│  │ 🤖 Done! I added      │  │
│  │ Chicken Pesto at      │  │
│  │ $13.99. Want to add   │  │
│  │ the recipe?           │  │
│  │                       │  │
│  │ [___message___] [🎤]  │  │  ← Text input + mic button
│  └───────────────────────┘  │
│                             │
│  [Dashboard][Menu][...]     │  ← Existing bottom nav
└─────────────────────────────┘
```

### Core Components

#### 1. Speech-to-Text (Voice Input)
**Technology**: Browser's built-in Web Speech API (`webkitSpeechRecognition`)
- Free, no API costs
- Works on all modern mobile browsers (Safari, Chrome)
- Falls back to text-only if not supported
- Real-time transcription — user sees words appear as they speak
- Tap mic to start, tap again to stop (or auto-stop on silence)

**Why not OpenAI Whisper?** Costs $0.006/minute. For a product being sold to potentially hundreds of restaurants, the Web Speech API is free and good enough. Whisper could be a premium tier later.

#### 2. AI Brain (OpenAI Function Calling)
**Technology**: OpenAI GPT-4o with tool/function calling
- System prompt describes the restaurant's context and available actions
- Tools map directly to existing API endpoints (reuse all existing logic)
- Streaming responses so the user sees the answer build in real-time
- Multi-turn conversation — the AI remembers context within a session

**How it works under the hood:**
1. User says "Add chicken alfredo to the menu for $13.99"
2. Browser converts speech → text
3. Text + conversation history sent to `/api/assistant/chat`
4. Server sends text to OpenAI with available tools defined
5. OpenAI returns a tool call: `add_menu_item({name: "Chicken Alfredo", price: 13.99})`
6. Server executes the tool (calls existing `/api/menu-items` POST logic)
7. Server sends result back to OpenAI
8. OpenAI generates a friendly response: "Done! I added Chicken Alfredo at $13.99. Want to add the recipe ingredients?"
9. Response streamed back to the user

#### 3. Tool System (What the AI Can Do)

The AI gets access to these tools, organized by category:

**Menu Management:**
- `add_menu_item` — Create a new menu item (name, price, category)
- `update_menu_item` — Change price, name, or deactivate
- `list_menu_items` — See all menu items with costs
- `get_menu_item_details` — Full details on one item including recipe

**Ingredient Management:**
- `add_ingredient` — Add new ingredient with pricing
- `update_ingredient_price` — Update cost per unit
- `list_ingredients` — See all ingredients
- `search_ingredients` — Find by name

**Recipe Management:**
- `add_recipe_ingredient` — Add ingredient to a menu item's recipe
- `get_recipe` — See full recipe with costs
- `calculate_food_cost` — Get food cost % for a menu item

**Sales & Revenue:**
- `get_sales_summary` — Revenue for a date range
- `get_top_selling_items` — Best sellers
- `get_daily_sales` — Day-by-day breakdown

**Expenses:**
- `add_expense` — Log a new expense
- `get_expenses` — View expenses by category/date
- `get_expense_summary` — Totals by category

**Labor:**
- `get_labor_summary` — Hours, costs, shifts
- `get_labor_forecast` — Upcoming week staffing needs

**Financial Analysis (READ-ONLY — the "smart manager" tools):**
- `get_profit_and_loss` — Full P&L for any date range
- `get_kpis` — All key performance indicators
- `get_projections` — Financial forecast and survival score
- `analyze_business` — Custom analysis based on user question
- `compare_periods` — Compare this week vs last week, this month vs last month
- `get_recommendations` — AI-generated suggestions for improvement

#### 4. Business Intelligence Prompt

The "smart manager" part comes from a carefully crafted system prompt that gives the AI restaurant industry knowledge:

```
You are the AI Assistant Manager for a restaurant. You have access to all the
restaurant's financial data, menu items, ingredients, recipes, sales, expenses,
and labor data.

When analyzing the business:
- Use the 30/30/30/10 rule (Food 30%, Labor 30%, Overhead 30%, Profit 10%)
- Prime cost (food + labor) should stay under 60% of revenue
- Food cost per item should be under 30% of selling price
- Revenue Per Labor Hour (RPLH) should be above $35
- Compare against fast-casual restaurant industry benchmarks
- Always explain in simple, plain language — the owner is not an accountant

When making recommendations:
- Be specific: "Raise Chicken Salad from $12.99 to $14.49" not "consider raising prices"
- Show the math: "This would save you $X per month"
- Prioritize high-impact, easy changes first
- Consider the restaurant's actual data, not generic advice
```

#### 5. Conversation History

New database table to persist chat history:

```sql
CREATE TABLE IF NOT EXISTS assistant_conversations (
  id TEXT PRIMARY KEY,
  started_at TEXT DEFAULT (datetime('now')),
  last_message_at TEXT DEFAULT (datetime('now')),
  summary TEXT  -- AI-generated summary for context in future sessions
);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,  -- 'user', 'assistant', 'system', 'tool'
  content TEXT NOT NULL,
  tool_calls TEXT,     -- JSON of tool calls made (if any)
  tool_results TEXT,   -- JSON of tool results (if any)
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES assistant_conversations(id)
);
```

#### 6. UI Component

**Floating Action Button (FAB):**
- Circular button, bottom-right, above bottom nav
- Porch brand teal color
- Microphone icon when idle, chat icon when there's history
- Subtle pulse animation on first visit to draw attention

**Chat Panel:**
- Slides up from bottom, covers ~70% of screen height
- Header: "AI Assistant" with close button
- Message bubbles: user on right (teal), assistant on left (white)
- When AI executes an action, show a special "action card" in the chat
  (e.g., green checkmark + "Added Chicken Alfredo to menu at $13.99")
- Text input at bottom with microphone button
- Mic button turns red when recording, shows waveform animation
- Auto-scroll to newest message

**Action Cards (special chat messages):**
When the AI performs an action (creates a menu item, logs an expense), show a styled card:
```
┌────────────────────────┐
│ ✅ Menu Item Added     │
│ Chicken Alfredo        │
│ Price: $13.99          │
│ [View Item →]          │
└────────────────────────┘
```
These cards link to the relevant page in the app.

### API Design

**`POST /api/assistant/chat`** — Main chat endpoint
- Request: `{ message: string, conversationId?: string }`
- Response: Server-Sent Events (SSE) stream
- Streams: text chunks, tool call notifications, final message

**`GET /api/assistant/conversations`** — List past conversations
- Returns recent conversations with summaries

**`GET /api/assistant/conversations/[id]`** — Get messages for a conversation
- Returns full message history

### Multi-Tenant Considerations (for selling to others)

When this becomes a SaaS product:
- Each restaurant gets their own OpenAI API key OR we meter usage per restaurant
- System prompt dynamically includes the restaurant's name, metrics, and context
- Conversation history is scoped to each restaurant
- Tool access can be configured per plan (basic: chat only, pro: full tools)

This is NOT built now but the architecture supports it:
- All tools call through API routes (not direct DB access)
- System prompt is generated dynamically, not hardcoded
- Conversation storage is already scoped by conversation ID

## Key Implementation Details

### Streaming Architecture
Vercel serverless functions have a 10s timeout on free tier. OpenAI function calling with tools can take 5-15s per turn. Solution:
- Use Next.js streaming (ReadableStream) for SSE
- Vercel supports streaming up to 30s on free tier
- If a multi-tool response is needed, stream each step

### Error Handling
- If OpenAI API fails: show friendly error "I'm having trouble thinking right now. Try again in a moment."
- If a tool execution fails: AI gets the error and explains what went wrong in plain language
- If speech recognition fails: fall back to text input gracefully

### Cost Management
- Web Speech API: FREE
- OpenAI GPT-4o: ~$0.005 per message exchange (input + output)
- At 50 messages/day: ~$7.50/month per restaurant
- Consider caching common queries (KPIs, top sellers) to reduce API calls

### Security
- All tool executions go through existing API routes (already validated)
- No raw SQL — AI cannot directly query database
- Rate limiting on chat endpoint (prevent abuse)
- Message content sanitized before storage

## Acceptance Criteria

### Must Have (MVP)
- [ ] Floating chat button visible on all pages
- [ ] Chat panel opens/closes smoothly
- [ ] Text input works — user can type messages
- [ ] Voice input works — user can tap mic and speak
- [ ] AI can add menu items via natural language
- [ ] AI can add ingredients via natural language
- [ ] AI can add recipe ingredients to menu items
- [ ] AI can log expenses
- [ ] AI can answer "How are my sales doing?" with real data
- [ ] AI can answer "What's my food cost?" with real numbers
- [ ] AI can give the P&L summary for any date range
- [ ] AI can recommend price changes based on food cost analysis
- [ ] Conversation persists during a session
- [ ] Action cards show when AI performs operations
- [ ] Works on mobile (iPhone Safari)

### Nice to Have (Post-MVP)
- [ ] Conversation history across sessions
- [ ] AI-generated daily briefing ("Good morning! Yesterday you did $847 in sales...")
- [ ] Voice output (text-to-speech for AI responses)
- [ ] Suggested quick prompts ("How were sales today?", "What should I order?")
- [ ] Photo input (take a photo of a receipt and send to AI)

## Build Phases

### Phase A: Chat Foundation (AI-1 + AI-2)
Build the chat API endpoint with OpenAI function calling, and the chat UI component.

### Phase B: Action Tools (AI-3 + AI-4)
Implement all the tools the AI can use — menu, ingredients, recipes, expenses.

### Phase C: Intelligence Tools (AI-5)
Add the read-only analysis tools — P&L, KPIs, projections, recommendations.

### Phase D: Voice Input (AI-6)
Add speech-to-text with Web Speech API.

### Phase E: Polish (AI-7)
Action cards, conversation history, suggested prompts, mobile optimization.
