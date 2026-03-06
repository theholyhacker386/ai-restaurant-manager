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
 * Ensure Plaid database tables exist with multi-tenant isolation (restaurant_id).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensurePlaidTables(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS plaid_items (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
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
      restaurant_id TEXT NOT NULL,
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
      restaurant_id TEXT NOT NULL,
      plaid_account_id TEXT REFERENCES plaid_accounts(account_id),
      transaction_id TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      name TEXT,
      merchant_name TEXT,
      category TEXT,
      category_detailed TEXT,
      pending BOOLEAN DEFAULT false,
      expense_id TEXT,
      auto_categorized BOOLEAN DEFAULT false,
      review_status TEXT DEFAULT 'pending',
      suggested_category_id TEXT,
      approved_category_id TEXT,
      source TEXT DEFAULT 'plaid',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS plaid_category_rules (
      id TEXT PRIMARY KEY,
      restaurant_id TEXT NOT NULL,
      merchant_pattern TEXT NOT NULL,
      category_id TEXT NOT NULL,
      category_name TEXT,
      times_used INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(restaurant_id, merchant_pattern, category_id)
    )
  `;

  // Handle existing tables that may lack restaurant_id
  try {
    await sql`ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS restaurant_id TEXT`;
    await sql`ALTER TABLE plaid_category_rules ADD COLUMN IF NOT EXISTS restaurant_id TEXT`;
  } catch {
    // Column may already exist
  }
}
