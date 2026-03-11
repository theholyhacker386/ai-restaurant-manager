import { NextResponse } from "next/server";

/**
 * GET /api/square/oauth/authorize
 * Redirects the user to Square's OAuth page to connect their POS.
 */
export async function GET() {
  const appId = process.env.SQUARE_APPLICATION_ID;
  if (!appId) {
    return NextResponse.json(
      { error: "Square is not configured" },
      { status: 500 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const redirectUri = `${baseUrl}/api/square/oauth/callback`;

  const scopes = [
    "ITEMS_READ",
    "ORDERS_READ",
    "MERCHANT_PROFILE_READ",
    "EMPLOYEES_READ",
    "TIMECARDS_READ",
  ].join("+");

  const squareUrl =
    `https://connect.squareup.com/oauth2/authorize` +
    `?client_id=${appId}` +
    `&scope=${scopes}` +
    `&session=false` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return NextResponse.redirect(squareUrl);
}
