import { NextResponse, type NextRequest } from "next/server";
import {
  AUTH_COOKIE,
  MAX_AGE_SECONDS,
  createSessionToken,
  verifyPassword,
} from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Only allow redirects to local paths to avoid open-redirect abuse. */
function safeNext(next: FormDataEntryValue | null): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function POST(request: NextRequest) {
  const form = await request.formData();
  const next = safeNext(form.get("next"));
  const password = form.get("password");

  if (!verifyPassword(typeof password === "string" ? password : "")) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "1");
    if (next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url, { status: 303 });
  }

  const res = NextResponse.redirect(new URL(next, request.url), { status: 303 });
  res.cookies.set(AUTH_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}
