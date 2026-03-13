import { neon } from "@neondatabase/serverless";

/**
 * Get Square credentials from platform_settings table, falling back to env vars.
 */
export async function getSquareCredentials(): Promise<{
  applicationId: string | null;
  applicationSecret: string | null;
  environment: string;
}> {
  // Try database first
  try {
    const sql = neon(process.env.NEON_DATABASE_URL!);
    const rows = await sql`
      SELECT key, value FROM platform_settings
      WHERE key IN ('square_application_id', 'square_application_secret', 'square_environment')
    `;

    const dbSettings: Record<string, string> = {};
    for (const row of rows) {
      dbSettings[row.key] = row.value;
    }

    if (dbSettings.square_application_id) {
      return {
        applicationId: dbSettings.square_application_id,
        applicationSecret: dbSettings.square_application_secret || null,
        environment: dbSettings.square_environment || "production",
      };
    }
  } catch {
    // Fall through to env vars
  }

  // Fallback to environment variables
  return {
    applicationId: process.env.SQUARE_APPLICATION_ID || null,
    applicationSecret: process.env.SQUARE_APPLICATION_SECRET || null,
    environment: "production",
  };
}
