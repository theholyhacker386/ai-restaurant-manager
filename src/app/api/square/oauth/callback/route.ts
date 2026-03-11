import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";

/**
 * GET /api/square/oauth/callback?code=...
 * Handles the OAuth callback from Square after user authorizes.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/onboarding?square=error&reason=no_code`
    );
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch(
      "https://connect.squareup.com/oauth2/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.SQUARE_APPLICATION_ID,
          client_secret: process.env.SQUARE_APPLICATION_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${baseUrl}/api/square/oauth/callback`,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Square token exchange failed:", tokenData);
      return NextResponse.redirect(
        `${baseUrl}/onboarding?square=error&reason=token_failed`
      );
    }

    // Save the token as a pending connection
    // During onboarding we may not have a restaurant_id yet,
    // so it gets claimed when onboarding completes
    const sql = neon(process.env.NEON_DATABASE_URL!);

    await sql`
      INSERT INTO pending_square_tokens (access_token, refresh_token, merchant_id, expires_at)
      VALUES (
        ${tokenData.access_token},
        ${tokenData.refresh_token || null},
        ${tokenData.merchant_id || null},
        ${tokenData.expires_at || null}
      )
    `;

    return NextResponse.redirect(
      `${baseUrl}/onboarding?square=success`
    );
  } catch (error) {
    console.error("Square OAuth callback error:", error);
    return NextResponse.redirect(
      `${baseUrl}/onboarding?square=error&reason=exception`
    );
  }
}
