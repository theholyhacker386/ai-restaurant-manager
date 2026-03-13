import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { getSquareCredentials } from "@/lib/square-config";

/**
 * GET /api/square/oauth/callback?code=...
 * Handles the OAuth callback from Square after user authorizes.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const errorPage = (msg: string) => new NextResponse(
    `<!DOCTYPE html><html><body><script>
      if (window.opener) { window.opener.postMessage({ type: "square-oauth", status: "error" }, "*"); }
      window.close();
      document.body.innerHTML = "<p style='font-family:sans-serif;text-align:center;margin-top:40px'>${msg}</p>";
    </script></body></html>`,
    { headers: { "Content-Type": "text/html" } }
  );

  if (!code) {
    return errorPage("Square connection was cancelled. You can close this window.");
  }

  try {
    const creds = await getSquareCredentials();

    if (!creds.applicationId || !creds.applicationSecret) {
      return errorPage("Square is not configured yet. Please contact support.");
    }

    // Use production or sandbox URL based on environment setting
    const squareBase = creds.environment === "sandbox"
      ? "https://connect.squareupsandbox.com"
      : "https://connect.squareup.com";

    // Exchange authorization code for access token
    const tokenResponse = await fetch(
      `${squareBase}/oauth2/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: creds.applicationId,
          client_secret: creds.applicationSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${baseUrl}/api/square/oauth/callback`,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok || !tokenData.access_token) {
      console.error("Square token exchange failed:", tokenData);
      return errorPage("Something went wrong connecting Square. You can close this window and try again.");
    }

    // Save the token as a pending connection
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

    // Return a small HTML page that notifies the opener window and closes the popup
    return new NextResponse(
      `<!DOCTYPE html><html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: "square-oauth", status: "success" }, "*");
        }
        window.close();
        // Fallback if popup can't close itself
        document.body.innerHTML = "<p style='font-family:sans-serif;text-align:center;margin-top:40px'>Square connected! You can close this window.</p>";
      </script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error) {
    console.error("Square OAuth callback error:", error);
    return new NextResponse(
      `<!DOCTYPE html><html><body><script>
        if (window.opener) {
          window.opener.postMessage({ type: "square-oauth", status: "error" }, "*");
        }
        window.close();
        document.body.innerHTML = "<p style='font-family:sans-serif;text-align:center;margin-top:40px'>Something went wrong. You can close this window and try again.</p>";
      </script></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
