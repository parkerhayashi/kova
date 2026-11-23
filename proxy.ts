import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isAuthEnabled, verifySessionToken } from "@/lib/auth";

/**
 * App-wide password gate (Next 16 renamed `middleware` -> `proxy`; runs on the
 * Node.js runtime by default). Every request that isn't a public asset, the
 * login flow, or a self-authorizing cron route must carry a valid session
 * cookie — otherwise pages redirect to /login and API calls get a 401.
 */

const PUBLIC_PATHS = ["/login", "/privacy", "/api/login", "/api/logout"];

/** Cron routes — guarded by CRON_SECRET in lib/cron-auth.ts. */
const CRON_PATHS = ["/api/sync/oura", "/api/sync/hevy", "/api/sync/garmin", "/api/sync/plaid"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

export function proxy(request: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next();

  const { pathname } = request.nextUrl;

  // Vercel Cron sync routes authenticate with CRON_SECRET, not the session
  // cookie, so let only those reach their own guard. (/api/sync/client is a
  // browser route and stays behind the session.)
  if (CRON_PATHS.includes(pathname)) return NextResponse.next();
  if (pathname === "/api/hevy/webhook") return NextResponse.next();
  // Muse custom connector uses MUSE_API_TOKEN, not the session cookie.
  if (pathname.startsWith("/api/muse")) return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (verifySessionToken(token)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Run on everything except static assets and PWA files so the login page and
  // service worker still load while logged out.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.json|sw.js|icons/|robots.txt|.*\\.svg$).*)",
  ],
};
