import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeToken } from "@/lib/oura";
import { encryptToken } from "@/lib/crypto";
import { syncOura } from "@/lib/data/oura";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Oura OAuth callback. Verifies the CSRF state, exchanges the authorization
 * code for tokens, encrypts them, and stores them on the single user_settings
 * row. Redirects back to the dashboard on success.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${origin}/?oura=denied`);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("oura_oauth_state")?.value;
  cookieStore.delete("oura_oauth_state");

  if (!code || !state || state !== expectedState) {
    return NextResponse.redirect(`${origin}/?oura=invalid_state`);
  }

  try {
    const tokens = await exchangeToken({ grant_type: "authorization_code", code });

    const db = createServiceClient();
    const { data: settings } = await db
      .from("user_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    const payload = {
      oura_access_token: encryptToken(tokens.access_token),
      oura_refresh_token: encryptToken(tokens.refresh_token),
      updated_at: new Date().toISOString(),
    };

    if (settings?.id) {
      await db.from("user_settings").update(payload).eq("id", settings.id);
    } else {
      await db.from("user_settings").insert(payload);
    }
  } catch {
    return NextResponse.redirect(`${origin}/?oura=error`);
  }

  // Backfill immediately so the dashboard has history on first load. The daily
  // cron keeps it current afterward; a failure here isn't fatal to connecting.
  try {
    await syncOura(90);
  } catch {
    return NextResponse.redirect(`${origin}/?oura=connected&sync=failed`);
  }

  return NextResponse.redirect(`${origin}/?oura=connected`);
}
