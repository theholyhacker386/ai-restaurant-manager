import { neon } from "@neondatabase/serverless";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Square API helper — manages token retrieval, refresh, and API calls.
 * Think of this as the "translator" that talks to Square on behalf of a restaurant.
 */

interface SquareToken {
  access_token: string;
  refresh_token: string | null;
  merchant_id: string | null;
  expires_at: string | null;
  restaurant_id: string | null;
}

const SQUARE_BASE = "https://connect.squareup.com";

/**
 * Get the Square access token for a restaurant.
 * First checks if the token is linked to a restaurant, then falls back to pending tokens.
 */
export async function getSquareToken(restaurantId?: string): Promise<SquareToken | null> {
  const sql = neon(process.env.NEON_DATABASE_URL!);

  // First try: linked token for this specific restaurant
  if (restaurantId) {
    const linked = await sql`
      SELECT access_token, refresh_token, merchant_id, expires_at, restaurant_id
      FROM square_tokens
      WHERE restaurant_id = ${restaurantId}
      ORDER BY created_at DESC LIMIT 1
    `;
    if (linked.length > 0) return linked[0] as SquareToken;
  }

  // Fallback: pending token (from onboarding, not yet linked to a restaurant)
  const pending = await sql`
    SELECT access_token, refresh_token, merchant_id, expires_at, NULL as restaurant_id
    FROM pending_square_tokens
    ORDER BY created_at DESC LIMIT 1
  `;
  if (pending.length > 0) return pending[0] as SquareToken;

  return null;
}

/**
 * Link a pending Square token to a specific restaurant.
 * Called after onboarding is complete.
 */
export async function linkSquareToken(restaurantId: string): Promise<boolean> {
  const sql = neon(process.env.NEON_DATABASE_URL!);

  // Get the most recent pending token
  const pending = await sql`
    SELECT id, access_token, refresh_token, merchant_id, expires_at
    FROM pending_square_tokens
    ORDER BY created_at DESC LIMIT 1
  `;

  if (pending.length === 0) return false;

  // Create the linked token
  await sql`
    INSERT INTO square_tokens (id, restaurant_id, access_token, refresh_token, merchant_id, expires_at)
    VALUES (
      ${"sqt_" + Date.now().toString(36)},
      ${restaurantId},
      ${pending[0].access_token},
      ${pending[0].refresh_token},
      ${pending[0].merchant_id},
      ${pending[0].expires_at}
    )
    ON CONFLICT (restaurant_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = EXCLUDED.refresh_token,
      merchant_id = EXCLUDED.merchant_id,
      expires_at = EXCLUDED.expires_at,
      updated_at = NOW()
  `;

  return true;
}

/**
 * Refresh a Square access token using the refresh token.
 */
export async function refreshSquareToken(restaurantId: string): Promise<string | null> {
  const sql = neon(process.env.NEON_DATABASE_URL!);

  const tokens = await sql`
    SELECT refresh_token FROM square_tokens WHERE restaurant_id = ${restaurantId}
  `;
  if (tokens.length === 0 || !tokens[0].refresh_token) return null;

  // Get Square app credentials from platform_settings
  const settings = await sql`
    SELECT key, value FROM platform_settings
    WHERE key IN ('square_application_id', 'square_application_secret')
  `;
  const settingsMap: Record<string, string> = {};
  for (const r of settings) settingsMap[r.key] = r.value;

  const clientId = settingsMap.square_application_id || process.env.SQUARE_APPLICATION_ID;
  const clientSecret = settingsMap.square_application_secret || process.env.SQUARE_APPLICATION_SECRET;

  if (!clientId || !clientSecret) return null;

  const res = await fetch(`${SQUARE_BASE}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: tokens[0].refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  if (!data.access_token) return null;

  // Update the stored token
  await sql`
    UPDATE square_tokens SET
      access_token = ${data.access_token},
      refresh_token = ${data.refresh_token || tokens[0].refresh_token},
      expires_at = ${data.expires_at || null},
      updated_at = NOW()
    WHERE restaurant_id = ${restaurantId}
  `;

  return data.access_token;
}

/**
 * Make an authenticated request to the Square API.
 * Automatically refreshes token if expired.
 */
export async function squareApiCall(
  restaurantId: string,
  path: string,
  options: { method?: string; body?: any } = {}
): Promise<any> {
  const token = await getSquareToken(restaurantId);
  if (!token) throw new Error("No Square token found");

  const accessToken = token.access_token;

  let res = await fetch(`${SQUARE_BASE}/v2${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Square-Version": "2024-12-18",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  // If unauthorized, try refreshing the token
  if (res.status === 401 && restaurantId) {
    const newToken = await refreshSquareToken(restaurantId);
    if (newToken) {
      res = await fetch(`${SQUARE_BASE}/v2${path}`, {
        method: options.method || "GET",
        headers: {
          Authorization: `Bearer ${newToken}`,
          "Content-Type": "application/json",
          "Square-Version": "2024-12-18",
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    }
  }

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Square API error ${res.status}: ${errBody}`);
  }

  return res.json();
}

/**
 * Fetch merchant profile from Square (includes business name, hours, etc.)
 */
export async function getSquareMerchantProfile(restaurantId: string) {
  try {
    const data = await squareApiCall(restaurantId, "/merchants/me");
    return data.merchant || null;
  } catch {
    return null;
  }
}

/**
 * Fetch business hours from Square location
 */
export async function getSquareBusinessHours(restaurantId: string) {
  try {
    const data = await squareApiCall(restaurantId, "/locations");
    const locations = data.locations || [];
    if (locations.length === 0) return null;

    const location = locations[0]; // Primary location
    return {
      locationId: location.id,
      name: location.name,
      address: location.address,
      timezone: location.timezone,
      businessHours: location.business_hours?.periods || [],
      status: location.status,
    };
  } catch {
    return null;
  }
}
