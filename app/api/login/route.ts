import { NextResponse, type NextRequest } from "next/server";
import { applySessionCookie, verifyPassword } from "@/lib/auth";
import { getTotpSecret, isMfaEnabled } from "@/lib/data/auth";
import {
  clearLoginAttempts,
  isLoginRateLimited,
  recordFailedLogin,
} from "@/lib/rate-limit";
import { verifyTotpCode } from "@/lib/totp";

export const dynamic = "force-dynamic";

/** Only allow redirects to local paths to avoid open-redirect abuse. */
function safeNext(next: FormDataEntryValue | null): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  const ip = clientIp(request);
  const { limited, retryAfterSec } = isLoginRateLimited(ip);
  if (limited) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "2");
    const res = NextResponse.redirect(url, { status: 303 });
    res.headers.set("Retry-After", String(retryAfterSec));
    return res;
  }

  const form = await request.formData();
  const next = safeNext(form.get("next"));
  const password = form.get("password");
  const totp = form.get("totp");

  if (!verifyPassword(typeof password === "string" ? password : "")) {
    recordFailedLogin(ip);
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "1");
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  if (await isMfaEnabled()) {
    const secret = await getTotpSecret();
    if (
      !secret ||
      !verifyTotpCode(secret, typeof totp === "string" ? totp : "")
    ) {
      recordFailedLogin(ip);
      const url = new URL("/login", request.url);
      url.searchParams.set("error", "3");
      if (next !== "/") url.searchParams.set("next", next);
      return NextResponse.redirect(url, { status: 303 });
    }
  }

  clearLoginAttempts(ip);

  const res = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  applySessionCookie(res, request);
  return res;
}
