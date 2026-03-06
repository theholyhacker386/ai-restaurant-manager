import * as OTPAuth from "otpauth";
import crypto from "crypto";

const APP_NAME = "AI Restaurant Manager";

/**
 * Generate a new TOTP secret for a user.
 * Returns the secret (base32) and an otpauth:// URI for QR codes.
 */
export function generateMfaSecret(userEmail: string) {
  const secret = new OTPAuth.Secret({ size: 20 });

  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    label: userEmail,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });

  return {
    secret: secret.base32,
    uri: totp.toString(),
  };
}

/**
 * Verify a TOTP code against a secret.
 * Allows a 1-period window in each direction to handle clock drift.
 */
export function verifyMfaCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: APP_NAME,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // delta returns null if invalid, or the time step difference
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

/**
 * Generate a set of one-time backup codes.
 * Returns an array of 8 codes, each 8 characters (hex).
 */
export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    const code = crypto.randomBytes(4).toString("hex"); // 8 hex chars
    codes.push(code);
  }
  return codes;
}

/**
 * Verify a backup code against the stored list.
 * Returns the updated list with the used code removed, or invalid if not found.
 */
export function verifyBackupCode(
  storedCodes: string[],
  inputCode: string
): { valid: boolean; remainingCodes: string[] } {
  const normalized = inputCode.toLowerCase().trim();
  const index = storedCodes.findIndex((c) => c.toLowerCase() === normalized);

  if (index === -1) {
    return { valid: false, remainingCodes: storedCodes };
  }

  const remainingCodes = [...storedCodes];
  remainingCodes.splice(index, 1);
  return { valid: true, remainingCodes };
}

/**
 * Create a signed token proving MFA was completed.
 * Used to securely update the JWT session after MFA validation.
 */
export function createMfaCompletionToken(userId: string): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("No auth secret configured");

  const timestamp = Date.now().toString();
  const payload = `${userId}:${timestamp}`;
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}:${hmac}`;
}

/**
 * Verify a signed MFA completion token.
 * Checks signature and ensures it's within a 5-minute window.
 */
export function verifyMfaCompletionToken(token: string, userId: string): boolean {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) return false;

  const parts = token.split(":");
  if (parts.length !== 3) return false;

  const [tokenUserId, timestamp, providedHmac] = parts;
  if (tokenUserId !== userId) return false;

  // 5-minute window
  const tokenTime = parseInt(timestamp);
  if (Date.now() - tokenTime > 5 * 60 * 1000) return false;

  const payload = `${tokenUserId}:${timestamp}`;
  const expectedHmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(providedHmac, "hex"),
    Buffer.from(expectedHmac, "hex")
  );
}
