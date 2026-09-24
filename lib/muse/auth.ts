import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** True when a Muse bearer token is configured (required in production). */
export function isMuseTokenConfigured(): boolean {
  return Boolean(process.env.MUSE_API_TOKEN);
}

/**
 * Muse custom-connector auth. Fail closed in production if the token is unset.
 * Locally, an unset token is allowed so the routes can be exercised in dev.
 */
export function isMuseAuthorized(request: Request): boolean {
  const expected = process.env.MUSE_API_TOKEN;
  if (!expected) return process.env.NODE_ENV !== "production";

  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  return timingSafeEqualStr(header.slice("Bearer ".length), expected);
}

export function museUnauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function museJson(
  request: Request,
  handler: () => Promise<unknown>,
): Promise<NextResponse> {
  if (!isMuseAuthorized(request)) return museUnauthorized();
  try {
    return NextResponse.json(await handler());
  } catch (err) {
    console.error("[muse]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Kova data" },
      { status: 500 },
    );
  }
}

export function clampDays(
  raw: string | null,
  fallback: number,
  max: number,
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(1, Math.round(n)));
}

export function mapToRecord(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(map);
}
