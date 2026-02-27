import { PlaidApi, PlaidEnvironments, Configuration } from "plaid";

let plaidClient: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (!plaidClient) {
    const clientId = process.env.PLAID_CLIENT_ID;
    const secret = process.env.PLAID_SECRET;
    const env = process.env.PLAID_ENV || "sandbox";

    if (!clientId || !secret) {
      throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be set");
    }

    const configuration = new Configuration({
      basePath:
        env === "production"
          ? PlaidEnvironments.production
          : env === "development"
          ? PlaidEnvironments.development
          : PlaidEnvironments.sandbox,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": secret,
        },
      },
    });

    plaidClient = new PlaidApi(configuration);
  }
  return plaidClient;
}

/**
 * Ensure Plaid database tables exist in Neon
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePlaidTables(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS plaid_items (
      id TEXT PRIMARY KEY,
      access_token TEXT NOT NULL,
      item_id TEXT NOT NULL UNIQUE,
      institution_id TEXT,
      institution_name TEXT,
      cursor TEXT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS plaid_accounts (
      id TEXT PRIMARY KEY,
      plaid_item_id TEXT NOT NULL REFERENCES plaid_items(id) ON DELETE CASCADE,
      account_id TEXT NOT NULL UNIQUE,
      name TEXT,
      official_name TEXT,
      type TEXT,
      subtype TEXT,
      mask TEXT,
      current_balance REAL,
      available_balance REAL,
      last_synced TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS plaid_transactions (
      id TEXT PRIMARY KEY,
      plaid_account_id TEXT REFERENCES plaid_accounts(account_id),
      transaction_id TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      name TEXT,
      merchant_name TEXT,
      category TEXT,
      category_detailed TEXT,
      pending BOOLEAN DEFAULT false,
      expense_id TEXT REFERENCES expenses(id),
      auto_categorized BOOLEAN DEFAULT false,
      review_status TEXT DEFAULT 'pending',
      suggested_category_id TEXT,
      approved_category_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Add newer columns that might not exist yet
  await sql`ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS is_soft_expense BOOLEAN DEFAULT false`;
  await sql`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS is_soft_expense BOOLEAN DEFAULT false`;

  // Statement upload columns
  await sql`ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'plaid'`;
  await sql`ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS statement_id TEXT`;

  // Bank statements table — stores uploaded PDF statements
  await sql`
    CREATE TABLE IF NOT EXISTS bank_statements (
      id TEXT PRIMARY KEY,
      file_name TEXT,
      bank_name TEXT,
      statement_date TEXT,
      period_start TEXT,
      period_end TEXT,
      pdf_data TEXT,
      transaction_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'processing',
      error_message TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // Learning table — stores approved merchant-to-category mappings
  await sql`
    CREATE TABLE IF NOT EXISTS plaid_category_rules (
      id TEXT PRIMARY KEY,
      merchant_pattern TEXT NOT NULL,
      category_id TEXT NOT NULL,
      category_name TEXT,
      times_used INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(merchant_pattern, category_id)
    )
  `;

  // Shopping list tables (wrapped in try-catch to avoid pg_type conflicts on concurrent calls)
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS shopping_lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        based_on_days INTEGER DEFAULT 7,
        multiplier REAL DEFAULT 1.0,
        total_estimated_cost REAL DEFAULT 0,
        status TEXT DEFAULT 'draft',
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS shopping_list_items (
        id TEXT PRIMARY KEY,
        shopping_list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
        ingredient_name TEXT NOT NULL,
        supplier TEXT DEFAULT 'Unknown',
        quantity_needed TEXT,
        estimated_cost TEXT,
        packages_to_buy INTEGER,
        package_info TEXT,
        checked BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
  } catch {
    // Tables likely already exist — safe to ignore
  }
}
