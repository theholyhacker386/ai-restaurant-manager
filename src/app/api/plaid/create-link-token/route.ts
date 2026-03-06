import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { getRestaurantId } from "@/lib/tenant";
import { Products, CountryCode } from "plaid";

export async function POST() {
  try {
    const restaurantId = await getRestaurantId();
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
