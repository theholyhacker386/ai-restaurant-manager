import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { getRestaurantId } from "@/lib/tenant";
import { checkRateLimit } from "@/lib/rate-limit";
import { Products, CountryCode } from "plaid";

export async function POST() {
  try {
    const restaurantId = await getRestaurantId();

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
  } catch (error: unknown) {
    console.error("Error creating link token:", error);
    return NextResponse.json(
      { error: "Failed to create link token" },
      { status: 500 }
    );
  }
}
