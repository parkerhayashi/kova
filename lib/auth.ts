import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Single-user password gate. Kova is a personal dashboard, so rather than a
 * full account system we protect the whole app behind one password
 * (`KOVA_PASSWORD`). A successful login mints a short signed token stored in an
 * HttpOnly cookie; `proxy.ts` verifies it on every request.
 *
 * The gate is only active when `KOVA_PASSWORD` is set — without it the app runs
 * open (dev convenience). Set it in every deployment.
 */

export const AUTH_COOKIE = "kova_session";
export const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

/** Auth is enforced only once a password is configured. */
export function isAuthEnabled(): boolean {
  return Boolean(process.env.KOVA_PASSWORD);
}

/**
 * HMAC key for session tokens. Prefer a dedicated `AUTH_SECRET`; fall back to
 * the password itself so a single env var is enough to turn the gate on.
 * (Rotating the password then also invalidates existing sessions, which is fine.)
 */
function signingKey(): string {
  return process.env.AUTH_SECRET || process.env.KOVA_PASSWORD || "";
}

function sign(value: string): string {
  return createHmac("sha256", signingKey()).update(value).digest("base64url");
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Mint a signed session token of the form `<expiresAtMs>.<hmac>`. */
export function createSessionToken(): string {
  const expiresAt = String(Date.now() + MAX_AGE_SECONDS * 1000);
  return `${expiresAt}.${sign(expiresAt)}`;
}

/** Verify a session token's signature and that it hasn't expired. */
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const expiresAt = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!timingSafeEqualStr(sig, sign(expiresAt))) return false;
  const expiresAtMs = Number(expiresAt);
  return Number.isFinite(expiresAtMs) && Date.now() < expiresAtMs;
}

/** Constant-time check of a submitted password against `KOVA_PASSWORD`. */
export function verifyPassword(input: string | undefined | null): boolean {
  const expected = process.env.KOVA_PASSWORD;
  if (!expected) return false;
  if (typeof input !== "string" || input.length === 0) return false;
  return timingSafeEqualStr(input, expected);
}

/** True when the response should set the Secure cookie flag (Vercel/proxies). */
export function isSecureRequest(request: NextRequest): boolean {
  if (request.nextUrl.protocol === "https:") return true;
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto === "https") return true;
  return process.env.NODE_ENV === "production";
}

/** Attach a fresh 30-day session cookie (password-only or MFA login). */
export function applySessionCookie(
  response: NextResponse,
  request: NextRequest,
): void {
  response.cookies.set(AUTH_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

/** Clear the session cookie on logout. */
export function clearSessionCookie(
  response: NextResponse,
  request: NextRequest,
): void {
  response.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
