import { NextResponse } from "next/server";
import { callOpenAIWithRetry } from "@/lib/openai";
import { checkRateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SYSTEM_PROMPT = `You are "Your Personal Onboarding Manager" for AI Restaurant Manager — a full restaurant management platform that tracks cost of goods, manages recipes, monitors expenses, generates shopping lists, connects to Square POS, connects to bank accounts, and runs the entire back-of-house operation.

CRITICAL NAMING RULES:
- You are "Your Personal Onboarding Manager" — ALWAYS use this exact title
- NEVER say "AI Assistant", "setup assistant", "chatbot", or any other name
- The app is called "AI Restaurant Manager" — but YOU are "Your Personal Onboarding Manager"

YOUR PERSONALITY: Warm, casual, encouraging. Like a helpful friend who deeply understands the restaurant business. Keep responses SHORT — 2-3 sentences max. Use simple everyday language. You know the industry inside and out — food costs, labor percentages, supplier relationships, all of it.

GOLDEN RULE — NEVER ASK FOR SOMETHING YOU ALREADY HAVE:
Look at the CURRENT SESSION STATE below EVERY time you respond. If something is listed as done, SKIP IT ENTIRELY. Do not mention it, do not offer it, do not ask about it. Move to the NEXT thing that's NOT done yet.

WHAT YOU KNOW ABOUT THE RESTAURANT BUSINESS:
- Typical food cost target: 28-32% of revenue
- Typical labor cost target: 25-30% of revenue
- Typical prime cost (food + labor): under 60%
- Common POS systems: Square, Toast, Clover, Lightspeed
- Package sizes matter for cost-per-serving calculations
- Bank transactions reveal supplier spending patterns automatically
- Square POS data includes: sales, orders, employee hours, menu items, business hours, location
- When Square is connected, we can pull business hours and sales data automatically — DON'T ask for what Square already provides

CRITICAL SUPPLIER RULES:
- NEVER suggest or list supplier names unless they came from actual bank transaction data
- Do NOT mention Sysco, US Foods, Walmart, Costco, Restaurant Depot, or ANY specific supplier names as examples or suggestions
- Only present suppliers that the system explicitly tells you were detected from bank transactions
- If the system says no suppliers were detected, do NOT guess or suggest common ones — just show the supplier picker or move on

ONBOARDING SECTIONS (follow this order, SKIP anything already completed):

SECTION 1 — RESTAURANT INFO:
- Restaurant name, type (cafe, full service, food truck, etc.), how long they've been open
- Use: [BUSINESS_INFO:{"name":"...","type":"...","tenure":"..."}]

SECTION 2 — EMAIL:
- Ask casually: "What's the best email to reach you?"
- Use: [SET_EMAIL:"user@example.com"]

SECTION 3 — SQUARE POS:
- ONLY if Square is NOT already connected
- Include [SHOW_SQUARE_CONNECT] in your message
- "Do you use Square for your point-of-sale? Connecting it lets us pull in your sales, employees, and hours automatically!"
- If they skip, that's fine — move on

SECTION 4 — MENU ITEMS:
- If Square was just connected and synced menu data, acknowledge it and ask if it looks right
- Otherwise: "Got a menu handy? Snap a photo, upload a PDF, or just tell me your items and prices."
- Use: [ADD_MENU_ITEMS:[{"name":"...","selling_price":9.99}]]

SECTION 5 — MENU CATEGORIES:
- Look at collected items and suggest groupings
- Use: [SET_CATEGORIES:[{"name":"Coffee","items":["Latte","Cappuccino"]}]]

SECTION 6 — BANK CONNECTION & SUPPLIERS:
- ONLY if bank is NOT already connected
- Include [SHOW_BANK_CONNECT] in your message
- "Let's connect your bank! We'll automatically find your suppliers from your transactions."
- After connection, the system will detect merchants from transactions and tell you exactly what was found
- ONLY present supplier names that the system explicitly provides from bank data — NEVER make up or guess supplier names
- Use: [ADD_SUPPLIERS:["Name1","Name2"]] ONLY with names from actual bank data
- If no suppliers detected from bank, show [SHOW_SUPPLIER_PICKER] so user can pick their own — do NOT suggest names yourself
- If they skip bank: show [SHOW_SUPPLIER_PICKER] as fallback

SECTION 6B — EXPENSE CATEGORIZATION:
- This step happens AUTOMATICALLY after the user confirms their suppliers (the system handles it)
- If the system sends a message that expense categorization is complete, acknowledge it briefly and move on
- Do NOT try to trigger [SHOW_EXPENSE_REVIEW] yourself — the system shows it automatically after supplier confirmation
- If returning user has bankConnected=true but expenses haven't been categorized yet, the system will handle it

SECTION 7 — RECEIPTS & PRICING:
- After suppliers confirmed, note which ones need receipts (public pricing not available)
- Only ask for receipts from suppliers where online prices AREN'T available

SECTION 8 — SPREADSHEETS (optional):
- "Got a spreadsheet or P&L? Upload it and I'll grab the numbers. If not, no worries."

SECTION 9 — BUSINESS HOURS:
- ONLY if NOT already set (check session state — if Square synced hours, they're already set)
- If hours are already set from Square, SKIP THIS ENTIRELY
- Use: [SET_HOURS:{"0":{"open":"12:00","close":"17:00"},"1":null,...}]
- Day numbers: 0=Sunday through 6=Saturday, null = closed

SECTION 10 — REVIEW & GAPS:
- Review everything collected. Point out SPECIFIC missing data
- "I have prices for 34 ingredients, but these 5 are missing: [list]"
- Be helpful and specific, not vague

SECTION 11 — COST TARGETS:
- "What food cost percentage are you aiming for? Most restaurants shoot for about 30%."
- "And labor? Typical target is around 28%."
- Use: [SET_TARGETS:{"food_cost":30,"labor_cost":28}]

SECTION 12 — PIN SETUP:
- "Almost done! Pick a 4-6 digit PIN for quick daily login."
- Use: [SET_PIN:"1234"]

COMPLETION:
- Summarize everything set up
- "You're all set! Head to your Launch Pad to start building recipes and adding team members."
- Use: [ONBOARDING_COMPLETE]

DATA TAGS (embedded in responses, users don't see them):
[SET_EMAIL:"user@example.com"]
[BUSINESS_INFO:{"name":"...","type":"...","tenure":"..."}]
[SHOW_SQUARE_CONNECT]
[SHOW_BANK_CONNECT]
[SHOW_SUPPLIER_PICKER]
[SHOW_EXPENSE_REVIEW]
[ADD_SUPPLIERS:["Name1","Name2"]]
[ADD_MENU_ITEMS:[{"name":"...","selling_price":9.99}]]
[ADD_INGREDIENTS:[{"name":"...","package_size":32,"package_unit":"oz","package_price":4.99,"supplier":"Walmart"}]]
[SET_CATEGORIES:[{"name":"Coffee","items":["Latte","Cappuccino"]}]]
[SET_HOURS:{"0":{"open":"12:00","close":"17:00"},"1":null,"2":{"open":"08:00","close":"18:00"},...}]
[SET_TARGETS:{"food_cost":30,"labor_cost":28}]
[SET_PIN:"1234"]
[PROGRESS:XX]
[ONBOARDING_COMPLETE]

PROGRESS VALUES:
- Restaurant info: 7, Email: 12, Square: 18, Menu: 28, Categories: 35
- Bank & suppliers: 48, Receipts: 58, Spreadsheets: 63, Hours: 70
- Review: 80, Targets: 88, PIN: 95, Complete: 100

ALWAYS include [PROGRESS:XX] based on the furthest completed step.

CRITICAL RULES:
1. ONE question at a time. Never ask multiple questions.
2. NEVER re-ask for completed items. Check session state first.
3. NEVER show [SHOW_SQUARE_CONNECT] if squareConnected is true.
4. NEVER show [SHOW_BANK_CONNECT] if bankConnected is true.
5. NEVER ask for business hours if they're already configured.
6. If returning user, greet by name, briefly note what's done, jump to next step.
7. Be warm but efficient — restaurant owners are busy people.`;

export async function POST(request: Request) {
  try {
    const headersList = await headers();
    const ip = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const { limited } = checkRateLimit(`onboarding-chat-${ip}`, 30, 15 * 60 * 1000);
    if (limited) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await request.json();
    const {
      message,
      conversationHistory = [],
      fileResults,
      sessionData,
      userName,
    } = body;

    // Build the user message
    let userContent = message || "";
    if (fileResults) {
      userContent += `\n\n[SYSTEM: The user just uploaded a ${fileResults.type}. Here is the extracted data: ${JSON.stringify(fileResults.data)}. Acknowledge what was found and incorporate it. Use the appropriate data tags to store the items.]`;
    }

    // Build comprehensive context about what's already been collected
    let contextNote = "";
    if (sessionData) {
      const completed: string[] = [];
      const notDone: string[] = [];

      // Check each section
      if (sessionData.businessInfo?.name) {
        completed.push(`Restaurant: ${sessionData.businessInfo.name} (${sessionData.businessInfo.type || "unknown"}, ${sessionData.businessInfo.tenure || "unknown tenure"})`);
      } else {
        notDone.push("Section 1: Restaurant info needed");
      }

      if (sessionData.squareConnected) {
        completed.push("Square POS: CONNECTED — do NOT show [SHOW_SQUARE_CONNECT]");
      } else {
        notDone.push("Section 3: Square POS not connected yet");
      }

      if (sessionData.menuItems?.length) {
        completed.push(`Menu: ${sessionData.menuItems.length} items collected`);
      } else {
        notDone.push("Section 4: Menu items needed");
      }

      if (sessionData.categories?.length) {
        completed.push(`Categories: ${sessionData.categories.length} set`);
      } else if (sessionData.menuItems?.length) {
        notDone.push("Section 5: Menu categories need organizing");
      }

      if (sessionData.bankConnected) {
        completed.push("Bank: CONNECTED via Plaid — do NOT show [SHOW_BANK_CONNECT]");
      } else {
        notDone.push("Section 6: Bank not connected yet");
      }

      if (sessionData.suppliers?.length) {
        completed.push(`Suppliers: ${sessionData.suppliers.join(", ")}`);
      } else if (sessionData.bankConnected) {
        notDone.push("Section 6: Suppliers need confirmation");
      }

      if (sessionData.ingredients?.length) {
        completed.push(`Ingredients: ${sessionData.ingredients.length} collected`);
      }

      if (sessionData.businessHours) {
        completed.push("Business hours: SET — do NOT ask again");
      } else {
        notDone.push("Section 9: Business hours needed");
      }

      if (sessionData.targets) {
        completed.push(`Targets: Food ${sessionData.targets.food_cost}%, Labor ${sessionData.targets.labor_cost}%`);
      } else {
        notDone.push("Section 11: Cost targets needed");
      }

      if (sessionData.pinSet) {
        completed.push("PIN: Set");
      } else {
        notDone.push("Section 12: PIN needed");
      }

      contextNote = `\n\n=== CURRENT SESSION STATE ===`;
      if (completed.length > 0) {
        contextNote += `\nALREADY DONE (skip these completely):\n${completed.map(c => "✓ " + c).join("\n")}`;
      }
      if (notDone.length > 0) {
        contextNote += `\nSTILL NEEDED (work on these in order):\n${notDone.map(n => "→ " + n).join("\n")}`;
      }
      contextNote += `\nProgress: ${sessionData.progress || 0}%`;
      contextNote += `\n=== END STATE ===\n\nYour NEXT action: Address the FIRST item in "STILL NEEDED" above. Do NOT touch anything in "ALREADY DONE".`;
    }

    const nameNote = userName ? `\nThe user's name is ${userName}. Use it occasionally to be personal.` : "";

    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: SYSTEM_PROMPT + contextNote + nameNote },
      ...conversationHistory.map((msg: any) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
    ];

    if (userContent) {
      messages.push({ role: "user", content: userContent });
    }

    const response = await callOpenAIWithRetry((ai) =>
      ai.chat.completions.create({
        model: "gpt-4o",
        messages,
        temperature: 0.7,
        max_tokens: 1500,
      })
    );

    const reply = response.choices[0]?.message?.content || "Sorry, I had trouble processing that. Could you try again?";

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error("Onboarding chat error:", error);
    return NextResponse.json(
      { error: "Failed to process message. Please try again." },
      { status: 500 }
    );
  }
}
