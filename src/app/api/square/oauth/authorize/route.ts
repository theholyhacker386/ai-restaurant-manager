import { NextResponse } from "next/server";
import { getSquareCredentials } from "@/lib/square-config";
import crypto from "crypto";

/**
 * GET /api/square/oauth/authorize
 * Redirects the user to Square's OAuth page to connect their POS.
 */
export async function GET() {
  const creds = await getSquareCredentials();

  if (!creds.applicationId) {
    return NextResponse.json(
      { error: "Square is not configured. Ask your platform admin to set it up in Settings." },
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

  // Use production or sandbox URL based on environment setting
  const squareBase = creds.environment === "sandbox"
    ? "https://connect.squareupsandbox.com"
    : "https://connect.squareup.com";

  // Unique state parameter to prevent Square from caching/skipping the consent screen
  const state = crypto.randomBytes(16).toString("hex");

  const squareUrl =
    `${squareBase}/oauth2/authorize` +
    `?client_id=${creds.applicationId}` +
    `&scope=${scopes}` +
    `&session=false` +
    `&state=${state}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`;

  return NextResponse.redirect(squareUrl);
}
