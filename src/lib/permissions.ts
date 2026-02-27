/**
 * Role-based permissions for The Porch Health Park.
 *
 * Owner: Full access to everything
 * Manager: Can see dashboard, shopping lists, ingredients, recipes, orders, and their profile.
 *          Uses the AI chatbot for inventory counts.
 *          CANNOT see sales, hourly, labor, receipts, menu editing, financials, or settings.
 */

export type UserRole = "owner" | "manager";

// Pages that only the OWNER can access
const OWNER_ONLY_PAGES = [
  "/sales",             // Sales data
  "/hourly",            // Hourly breakdown
  "/menu",              // Menu items (editing)
  "/inventory-usage",   // Inventory usage reports
  "/labor",             // Labor tracking
  // Receipts — managers CAN access (they scan receipts when receiving orders)
  "/expenses",          // Bank transactions & expense categorization
  "/kpis",              // Financial KPIs
  "/projections",       // Financial projections
  "/privacy",           // Privacy & security settings
];

// Pages that start with these paths are owner-only
const OWNER_ONLY_PREFIXES = [
  "/expenses/",         // Expense sub-pages (utilities, etc.)
  "/settings",          // Settings & team management
  "/menu/",             // Menu item detail pages
  // Receipts detail — managers CAN access
];

// API routes that only the OWNER can call
const OWNER_ONLY_API = [
  "/api/plaid/",          // All Plaid (bank) routes
  "/api/expenses",        // Expense data
  "/api/financials",      // P&L and financial reports
  "/api/kpis",            // KPI data
  "/api/projections",     // Projections
  "/api/statements",      // Bank statements
  "/api/team",            // Team management
];

/**
 * Check if a page/route is accessible for a given role.
 */
export function canAccessPage(pathname: string, role: UserRole): boolean {
  if (role === "owner") return true;

  // Check exact matches
  if (OWNER_ONLY_PAGES.includes(pathname)) return false;

  // Check prefix matches
  if (OWNER_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;

  return true;
}

/**
 * Check if an API route is accessible for a given role.
 */
export function canAccessAPI(pathname: string, role: UserRole): boolean {
  if (role === "owner") return true;

  // Check if the API path starts with any owner-only prefix
  if (OWNER_ONLY_API.some((prefix) => pathname.startsWith(prefix))) return false;

  return true;
}

/**
 * Get the list of bottom nav items visible to a role.
 */
export function getVisibleNavItems(role: UserRole) {
  const allItems = [
    { href: "/", label: "Home", icon: "home" },
    { href: "/sales", label: "Sales", icon: "sales", ownerOnly: true },
    { href: "/menu", label: "Menu", icon: "menu", ownerOnly: true },
    { href: "/recipes", label: "Recipes", icon: "recipes" },
    { href: "/ingredients", label: "Ingredients", icon: "ingredients" },
    { href: "/orders", label: "Orders", icon: "orders" },
    { href: "/schedule", label: "Schedule", icon: "schedule" },
    { href: "/labor", label: "Labor", icon: "labor", ownerOnly: true },
    { href: "/expenses", label: "Expenses", icon: "expenses", ownerOnly: true },
    { href: "/hourly", label: "Hourly", icon: "hourly", ownerOnly: true },
  ];

  if (role === "owner") return allItems;
  return allItems.filter((item) => !item.ownerOnly);
}
