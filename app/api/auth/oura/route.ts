import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { getAuthUrl } from "@/lib/oura";

export const dynamic = "force-dynamic";

const OAUTH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
};

/**
 * Start the Oura OAuth 2.0 flow. Generates a CSRF `state`, stashes it in an
 * httpOnly cookie, and redirects the browser to Oura's consent screen.
 * Visit /api/auth/oura to connect the ring.
 */
export async function GET(request: NextRequest) {
  const state = randomBytes(16).toString("hex");
  const redirectUri =
    process.env.OURA_REDIRECT_URI ??
    `${request.nextUrl.origin}/api/auth/oura/callback`;

  const cookieStore = await cookies();
  cookieStore.set("oura_oauth_state", state, OAUTH_COOKIE_OPTS);
  cookieStore.set("oura_oauth_redirect", redirectUri, OAUTH_COOKIE_OPTS);

  redirect(getAuthUrl(state, redirectUri));
}
