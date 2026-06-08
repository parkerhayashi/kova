/**
 * Oura API v2 integration (blueprint §2, Table 2).
 * OAuth 2.0 — Personal Access Tokens were deprecated December 2025.
 * All credentials live in server-side env vars; never expose to the browser.
 */

const OURA_BASE = "https://api.ouraring.com/v2/usercollection";
const OURA_AUTH = "https://cloud.ouraring.com/oauth/authorize";
const OURA_TOKEN = "https://api.ouraring.com/oauth/token";

export const OURA_SCOPES = [
  "daily",
  "heartrate",
  "workout",
  "personal",
  "session",
  "spo2",
] as const;

/** Build the consent URL to start the OAuth flow. */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.OURA_CLIENT_ID!,
    redirect_uri: process.env.OURA_REDIRECT_URI!,
    response_type: "code",
    scope: OURA_SCOPES.join(" "),
    state,
  });
  return `${OURA_AUTH}?${params}`;
}

interface OuraTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Exchange an authorization code (or refresh token) for access tokens. */
export async function exchangeToken(
  params:
    | { grant_type: "authorization_code"; code: string }
    | { grant_type: "refresh_token"; refresh_token: string },
): Promise<OuraTokens> {
  const body = new URLSearchParams({
    client_id: process.env.OURA_CLIENT_ID!,
    client_secret: process.env.OURA_CLIENT_SECRET!,
    redirect_uri: process.env.OURA_REDIRECT_URI!,
    ...params,
  });

  const res = await fetch(OURA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Oura token exchange failed: ${res.status}`);
  return res.json();
}

/** Fetch a date-ranged Oura collection endpoint. */
export async function ouraFetch<T = unknown>(
  endpoint: string,
  accessToken: string,
  range: { start_date: string; end_date: string },
): Promise<{ data: T[] }> {
  const params = new URLSearchParams(range);
  const res = await fetch(`${OURA_BASE}/${endpoint}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Oura ${endpoint} failed: ${res.status}`);
  return res.json();
}
