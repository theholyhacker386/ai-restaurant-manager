/**
 * Simple in-memory rate limiter for login attempts and API routes.
 * Tracks attempts by key (email, PIN, IP) with a sliding window.
 * Suitable for single-instance deployments (Vercel serverless resets on cold start).
 */

interface RateLimitEntry {
  attempts: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Check if a request should be rate-limited.
 * @param key - Unique identifier (e.g., email address, PIN, or IP + route)
 * @param maxAttempts - Max attempts allowed in the window
 * @param windowMs - Time window in milliseconds
 * @returns { limited, remaining, retryAfterMs }
 */
export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): { limited: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = store.get(key);

  // No entry or expired — allow
  if (!entry || now > entry.resetAt) {
    store.set(key, { attempts: 1, resetAt: now + windowMs });
    return { limited: false, remaining: maxAttempts - 1, retryAfterMs: 0 };
  }

  // Under limit — allow and increment
  if (entry.attempts < maxAttempts) {
    entry.attempts++;
    return { limited: false, remaining: maxAttempts - entry.attempts, retryAfterMs: 0 };
  }

  // Over limit — block
  return {
    limited: true,
    remaining: 0,
    retryAfterMs: entry.resetAt - now,
  };
}
