import { NextResponse } from "next/server";
import { getPlaidClient } from "@/lib/plaid";
import { Products, CountryCode } from "plaid";

export async function POST() {
  try {
    const client = getPlaidClient();

    const response = await client.linkTokenCreate({
      user: { client_user_id: "porch-owner" },
      client_name: "Porch Financial",
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
