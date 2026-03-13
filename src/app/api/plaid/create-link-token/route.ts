import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { checkRateLimit } from "@/lib/rate-limit";
import { Products, CountryCode } from "plaid";
import { auth } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function POST(request: Request) {
  try {
    let restaurantId: string | null = null;

    // Try getting restaurantId from the session first
    const session = await auth();
    if (session?.user) {
      restaurantId = (session.user as any).restaurantId || null;
    }

    // Fallback: if no session or no restaurantId, check request body for userId (onboarding flow)
    if (!restaurantId) {
      try {
        const body = await request.json();
        if (body.userId) {
          const sql = neon(process.env.NEON_DATABASE_URL!);
          const rows = await sql`SELECT restaurant_id FROM users WHERE id = ${body.userId}`;
          if (rows.length > 0 && rows[0].restaurant_id) {
            restaurantId = rows[0].restaurant_id;
          }
        }
      } catch {
        // Body might not be JSON, that's fine
      }
    }

    if (!restaurantId) {
      return NextResponse.json({ error: "Not authenticated or no restaurant found" }, { status: 401 });
    }

    // Rate limit: 5 link token requests per 15 minutes per restaurant
    const { limited } = checkRateLimit(`plaid-link-${restaurantId}`, 5, 15 * 60 * 1000);
    if (limited) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const client = getPlaidClient();

    const response = await client.linkTokenCreate({
      user: { client_user_id: restaurantId },
      client_name: "AI Restaurant Manager",
      products: [Products.Transactions],
      country_codes: [CountryCode.Us],
      language: "en",
    });

    return NextResponse.json({ link_token: response.data.link_token });
  } catch (error: any) {
    console.error("Error creating link token:", error?.response?.data || error?.message || error);
    const plaidError = error?.response?.data?.error_message || error?.message || "Unknown error";
    return NextResponse.json(
      { error: "Failed to create link token", detail: plaidError },
      { status: 500 }
    );
  }
}
