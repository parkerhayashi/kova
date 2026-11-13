import { NextResponse, type NextRequest } from "next/server";
import { syncGarmin } from "@/lib/data/garmin";
import { GarminAuthError } from "@/lib/garmin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_DAYS = 365;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Daily Garmin import — guarded by CRON_SECRET, scheduled in vercel.json. `?days=` re-reads further back. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const daysParam = Number(request.nextUrl.searchParams.get("days"));
  const days = daysParam > 0 ? Math.min(MAX_DAYS, Math.round(daysParam)) : undefined;

  try {
    const result = await syncGarmin({ days });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("not connected") ? 400 : err instanceof GarminAuthError ? 401 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
