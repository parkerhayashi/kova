/**
 * Strava API v3 integration (blueprint §2 & §4 notes).
 * OAuth 2.0. Access tokens expire every 6 hours — refresh before each call.
 *
 * Risk mitigations centralised here (§12):
 *  - Token expiry: `validToken()` auto-refreshes when within the expiry window.
 *  - Base URL change Jan 2027 → api-v3.strava.com: change BASE in one place.
 *  - Relative Effort not exposed → approximate training load from suffer_score.
 */

// TODO Jan 2027: swap to "https://api-v3.strava.com/api/v3" (§12).
const STRAVA_BASE = "https://www.strava.com/api/v3";
const STRAVA_AUTH = "https://www.strava.com/oauth/authorize";
const STRAVA_TOKEN = "https://www.strava.com/oauth/token";

export const STRAVA_SCOPES = "read,activity:read_all";

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: process.env.STRAVA_REDIRECT_URI!,
    response_type: "code",
    approval_prompt: "auto",
    scope: STRAVA_SCOPES,
    state,
  });
  return `${STRAVA_AUTH}?${params}`;
}

export interface StravaTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
}

export async function exchangeToken(
  params:
    | { grant_type: "authorization_code"; code: string }
    | { grant_type: "refresh_token"; refresh_token: string },
): Promise<StravaTokens> {
  const res = await fetch(STRAVA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      ...params,
    }),
  });
  if (!res.ok) throw new Error(`Strava token exchange failed: ${res.status}`);
  return res.json();
}

/**
 * Return a valid access token, refreshing if it expires within 5 minutes.
 * Pass a persist callback to store rotated tokens back into user_settings.
 */
export async function validToken(
  tokens: StravaTokens,
  persist?: (t: StravaTokens) => Promise<void>,
): Promise<string> {
  const expiringSoon = tokens.expires_at - 300 <= Math.floor(Date.now() / 1000);
  if (!expiringSoon) return tokens.access_token;

  const refreshed = await exchangeToken({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
  });
  await persist?.(refreshed);
  return refreshed.access_token;
}

export async function getActivities(
  accessToken: string,
  opts: { after?: number; page?: number; perPage?: number } = {},
): Promise<unknown[]> {
  const params = new URLSearchParams({
    page: String(opts.page ?? 1),
    per_page: String(opts.perPage ?? 30),
  });
  if (opts.after) params.set("after", String(opts.after));

  const res = await fetch(`${STRAVA_BASE}/athlete/activities?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Strava activities failed: ${res.status}`);
  return res.json();
}
