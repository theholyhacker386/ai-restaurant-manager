/**
 * OpenAI function calling tool definitions for the AI Assistant Manager.
 * These tell the AI what actions it can take and what info it needs.
 */

import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const assistantTools: ChatCompletionTool[] = [
  // ── MENU MANAGEMENT ──────────────────────────────────
  {
    type: "function",
    function: {
      name: "add_menu_item",
      description:
        "Add a new menu item to the restaurant. Use this when the user wants to create a new dish, drink, or product on the menu.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the menu item (e.g. 'Chicken Alfredo')" },
          selling_price: { type: "number", description: "Selling price in dollars (e.g. 13.99)" },
          category_name: {
            type: "string",
            description: "Category like 'Sandwiches', 'Drinks', 'Salads', 'Bowls'. Optional — if provided we'll find or create the category.",
          },
          notes: { type: "string", description: "Optional notes about the item" },
        },
        required: ["name", "selling_price"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_menu_items",
      description:
        "Get a list of all menu items with their prices, food cost percentages, and profit per item. Use when the user asks about menu items, what's on the menu, or wants an overview.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_menu_item_details",
      description:
        "Get full details about a specific menu item including its recipe, ingredient costs, and food cost percentage. Use when the user asks about a specific item.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Name of the menu item to look up (fuzzy match)" },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_menu_item",
      description: "Update a menu item's price or name.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Current name of the menu item to find" },
          new_name: { type: "string", description: "New name (if changing the name)" },
          new_price: { type: "number", description: "New selling price (if changing the price)" },
        },
        required: ["name"],
      },
    },
  },

  // ── INGREDIENT MANAGEMENT ────────────────────────────
  {
    type: "function",
    function: {
      name: "add_ingredient",
      description:
        "Add a new ingredient to the system. Use when the user wants to track a new ingredient they buy.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Ingredient name (e.g. 'Chicken Breast')" },
          unit: {
            type: "string",
            description: "Base unit for cost tracking: 'lb', 'oz', 'each', 'gallon', 'liter', etc.",
          },
          package_price: { type: "number", description: "Price of the package (e.g. 12.99)" },
          package_size: { type: "number", description: "How much is in the package (e.g. 5 for a 5 lb bag)" },
          package_unit: { type: "string", description: "Unit of the package size (usually same as unit)" },
          supplier: { type: "string", description: "Where they buy it (default: Walmart)" },
        },
        required: ["name", "unit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_ingredients",
      description: "Search for ingredients by name. Use to find an ingredient before adding it to a recipe.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search text to match against ingredient names" },
        },
        required: ["query"],
      },
    },
  },

  // ── RECIPE MANAGEMENT ────────────────────────────────
  {
    type: "function",
    function: {
      name: "add_recipe_ingredient",
      description:
        "Add an ingredient to a menu item's recipe. This defines how much of each ingredient goes into making one serving of the menu item.",
      parameters: {
        type: "object",
        properties: {
          menu_item_name: { type: "string", description: "Name of the menu item" },
          ingredient_name: { type: "string", description: "Name of the ingredient to add" },
          quantity: { type: "number", description: "How much of the ingredient per serving (e.g. 6 for 6 oz)" },
          quantity_unit: { type: "string", description: "Unit for the quantity (e.g. 'oz', 'each', 'g')" },
        },
        required: ["menu_item_name", "ingredient_name", "quantity", "quantity_unit"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recipe",
      description: "Get the full recipe for a menu item — all ingredients with quantities and costs.",
      parameters: {
        type: "object",
        properties: {
          menu_item_name: { type: "string", description: "Name of the menu item" },
        },
        required: ["menu_item_name"],
      },
    },
  },

  // ── EXPENSE TRACKING ─────────────────────────────────
  {
    type: "function",
    function: {
      name: "add_expense",
      description:
        "Log a business expense. Use when the user mentions paying for something — rent, utilities, supplies, etc.",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "What the expense is for" },
          amount: { type: "number", description: "Dollar amount" },
          date: { type: "string", description: "Date in YYYY-MM-DD format. Default to today if not specified." },
          category_name: {
            type: "string",
            description:
              "Expense category like 'Rent/Lease Payment', 'Electric', 'Payroll/Wages', etc. We'll fuzzy-match to the closest category.",
          },
        },
        required: ["description", "amount"],
      },
    },
  },

  // ── SALES & REVENUE ──────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_sales_summary",
      description:
        "Get sales data for a date range — total revenue, order count, average ticket, top selling items. Use when the user asks about sales, revenue, or how business is doing.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date YYYY-MM-DD. Defaults to start of current month." },
          end_date: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
        },
      },
    },
  },

  // ── FINANCIAL ANALYSIS ───────────────────────────────
  {
    type: "function",
    function: {
      name: "get_profit_and_loss",
      description:
        "Get a full profit & loss statement for a date range. Shows revenue, food cost, labor, overhead, and net profit with percentages and benchmarks. Use for financial analysis questions.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date YYYY-MM-DD. Defaults to start of current month." },
          end_date: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_kpis",
      description:
        "Get key performance indicators: Prime Cost %, Food Cost %, Labor %, Revenue Per Labor Hour, Average Ticket, Break-Even point. Use when the user asks about KPIs, performance, or benchmarks.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date YYYY-MM-DD. Defaults to start of current month." },
          end_date: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_labor_summary",
      description:
        "Get labor data for a date range — total hours, total cost, number of shifts, cost as % of revenue.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date YYYY-MM-DD. Defaults to start of current month." },
          end_date: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_business_recommendations",
      description:
        "Analyze the restaurant's current financial data and provide specific, actionable recommendations to improve profitability. Use when the user asks 'how can I make more money?' or 'what should I change?'",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── HOURLY PROFITABILITY ─────────────────────────────
  {
    type: "function",
    function: {
      name: "get_hourly_profitability",
      description:
        "Get hour-by-hour profit/loss analysis. Shows revenue, labor cost, and fixed overhead cost per hour. Identifies the most and least profitable hours, flags hours that consistently lose money, and calculates the break-even revenue needed per hour. Use when the user asks about hourly performance, which hours make/lose money, when to staff up/down, or the cost of staying open during slow hours.",
      parameters: {
        type: "object",
        properties: {
          start_date: { type: "string", description: "Start date YYYY-MM-DD. Defaults to start of current month." },
          end_date: { type: "string", description: "End date YYYY-MM-DD. Defaults to today." },
          mode: {
            type: "string",
            enum: ["average", "today"],
            description: "Use 'today' for real-time view with live clocked-in employees. Use 'average' for historical averages over the date range. Defaults to 'average'.",
          },
        },
      },
    },
  },

  // ── AI BRAIN — BUSINESS STATUS ──────────────────────
  {
    type: "function",
    function: {
      name: "get_business_status",
      description:
        "Get a comprehensive snapshot of the entire business right now. Shows: uncategorized transactions needing review, recent statement uploads, income vs expenses this month, top spending categories, what's selling best, and a prioritized to-do list. Use this FIRST when the user opens the chat or asks 'what should I do?' or 'how's my business?'",
      parameters: { type: "object", properties: {} },
    },
  },

  // ── SHOPPING LIST ──────────────────────────────────
  {
    type: "function",
    function: {
      name: "generate_shopping_list",
      description:
        "Generate a smart shopping list based on what's selling. Looks at recent sales data, checks recipes to calculate ingredient needs, compares to stock levels, and creates a list grouped by supplier (Walmart, Costco, etc). Use when the user asks about what to order, what to buy, or needs a shopping list.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "How many days of sales to base the list on (default 7). More days = smoother average.",
          },
          multiplier: {
            type: "number",
            description: "Multiply quantities by this factor (default 1.0). Use 1.5 for 50% buffer, 2.0 to order for two weeks, etc.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shopping_lists",
      description: "Get previously generated shopping lists. Use to review past orders or check what was already ordered.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "How many recent lists to return (default 5)" },
        },
      },
    },
  },

  // ── INVENTORY & STOCK ─────────────────────────────
  {
    type: "function",
    function: {
      name: "inventory_check",
      description:
        "Start an inventory count session. Returns items that need counting, optionally filtered by supplier. Use when the user says things like 'inventory check', 'stock count', 'what do I need to count?', or 'how much do I have?'. Returns items with their current stock levels and reorder points so the AI can walk the user through counting each one.",
      parameters: {
        type: "object",
        properties: {
          supplier: {
            type: "string",
            description: "Filter to a specific supplier (e.g. 'Webstaurant', 'What Chefs Want', 'Costco'). If omitted, returns all items that have reorder tracking enabled.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_stock",
      description:
        "Update the current stock level and/or par level for an ingredient. SMART UNIT CONVERSION: The user can say things like '2 sleeves' of cups (a sleeve is typically 50 cups), '3 cases' (converts using the package_size), '2 boxes', 'half a case', etc. The AI should convert the user's answer to the actual unit count before calling this. For example: if a case has 1000 cups and the user says '2 sleeves' (50 cups each), set quantity to 100. Also updates the reorder_point and/or par_level if provided. PAR LEVEL is the target amount to keep on hand — when generating shopping lists, the system orders enough to top off to par level.",
      parameters: {
        type: "object",
        properties: {
          ingredient_name: {
            type: "string",
            description: "Name of the ingredient to update (fuzzy match supported)",
          },
          quantity: {
            type: "number",
            description: "Current quantity on hand in the ingredient's base unit (e.g. number of cups, oz of syrup, etc). The AI must convert from the user's casual language (sleeves, cases, bags) to the actual count.",
          },
          reorder_point: {
            type: "number",
            description: "Optional: Set or update the reorder trigger point. When stock drops below this number, it shows as 'low stock'. Defaults to sensible values if not set.",
          },
          par_level: {
            type: "number",
            description: "Optional: Set or update the par level (target stock level). This is how much you want to keep on hand at all times. Shopping lists will order enough to top off to this level. Convert from the user's casual language (e.g. '2 bags' of a 16oz bag = 32).",
          },
        },
        required: ["ingredient_name", "quantity"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_low_stock_alerts",
      description:
        "Get a list of all ingredients that are running low (current stock is at or below the reorder point). Use when the user asks 'what do I need to order?', 'what's running low?', or 'any stock alerts?'. Also useful for the morning briefing.",
      parameters: {
        type: "object",
        properties: {
          supplier: {
            type: "string",
            description: "Optional: filter alerts to a specific supplier",
          },
        },
      },
    },
  },

  // ── ISSUE REPORTING ────────────────────────────────
  {
    type: "function",
    function: {
      name: "report_issue",
      description:
        "Submit a bug report or feedback about the platform. IMPORTANT: Before calling this tool, you MUST ask the user these questions to gather enough detail: 1) What page/screen were you on? 2) What did you expect to happen? 3) What actually happened instead? 4) Does this happen every time or just sometimes? Only call this tool AFTER you have gathered those answers from the user.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "A short 1-line summary of the issue (e.g. 'Sales page shows wrong date range')",
          },
          page_url: {
            type: "string",
            description: "The page URL or path where the issue occurred (from the user's context or their description)",
          },
          expected_behavior: {
            type: "string",
            description: "What the user expected to happen",
          },
          actual_behavior: {
            type: "string",
            description: "What actually happened (the bug/problem)",
          },
          steps_to_reproduce: {
            type: "string",
            description: "Steps to reproduce the issue, based on what the user described",
          },
          severity: {
            type: "string",
            enum: ["critical", "major", "minor", "suggestion"],
            description: "How bad is the issue: critical (app broken/data loss), major (feature not working), minor (cosmetic/small annoyance), suggestion (feature request or improvement idea)",
          },
          device_info: {
            type: "string",
            description: "Device/browser info from the user's context metadata",
          },
          viewport: {
            type: "string",
            description: "Screen size from the user's context metadata (e.g. '390x844')",
          },
          additional_context: {
            type: "string",
            description: "Any extra details from the conversation that might help fix the issue",
          },
        },
        required: ["summary", "actual_behavior", "severity"],
      },
    },
  },

  // ── ESCALATION ─────────────────────────────────────
  {
    type: "function",
    function: {
      name: "escalate_to_owner",
      description:
        "Flag the current conversation for the owner/higher-ups to review. Use when a manager or team member says things like 'send this to the owner', 'let the higher-ups know', 'send this up', 'flag this for Colby', 'pass this along', or similar requests to escalate information. This marks the conversation as needing owner review — it does NOT submit a bug report.",
      parameters: {
        type: "object",
        properties: {
          summary: {
            type: "string",
            description: "A brief summary of what the team member wants the owner to know (e.g. 'Inventory count completed — 8 sleeves of 16oz cups on hand, need to set up reorder points for remaining items')",
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
            description: "How urgently the owner should see this. Default: normal.",
          },
        },
        required: ["summary"],
      },
    },
  },
];
