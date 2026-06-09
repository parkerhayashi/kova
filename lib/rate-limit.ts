/**
 * In-memory sliding-window rate limiter for login brute-force protection.
 * Best-effort on serverless (per-instance); sufficient for a single-user app.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Failed login attempts allowed per IP within the window. */
export const LOGIN_MAX_ATTEMPTS = 10;
/** Window length in milliseconds (15 minutes). */
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

function pruneExpired(now: number): void {
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

function getBucket(key: string, now: number): Bucket {
  const existing = buckets.get(key);
  if (existing && now < existing.resetAt) return existing;
  const bucket = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
  buckets.set(key, bucket);
  return bucket;
}

export function isLoginRateLimited(key: string): {
  limited: boolean;
  retryAfterSec: number;
} {
  const now = Date.now();
  pruneExpired(now);
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt || bucket.count < LOGIN_MAX_ATTEMPTS) {
    return { limited: false, retryAfterSec: 0 };
  }
  return {
    limited: true,
    retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

export function recordFailedLogin(key: string): void {
  const now = Date.now();
  const bucket = getBucket(key, now);
  bucket.count += 1;
}

export function clearLoginAttempts(key: string): void {
  buckets.delete(key);
}
