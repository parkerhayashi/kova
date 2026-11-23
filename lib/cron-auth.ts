import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Cron / server-to-server sync routes authenticate with `CRON_SECRET` (Vercel
 * Cron sends it as a bearer token). Without the secret they only stay open in
 * development — in production a missing secret refuses every request.
 */
export function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
