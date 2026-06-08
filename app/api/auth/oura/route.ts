import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthUrl } from "@/lib/oura";

export const dynamic = "force-dynamic";

/**
 * Start the Oura OAuth 2.0 flow. Generates a CSRF `state`, stashes it in an
 * httpOnly cookie, and redirects the browser to Oura's consent screen.
 * Visit /api/auth/oura to connect the ring.
 */
export async function GET() {
  const state = randomBytes(16).toString("hex");

  const cookieStore = await cookies();
  cookieStore.set("oura_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  redirect(getAuthUrl(state));
}
