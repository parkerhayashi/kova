import { NextResponse, type NextRequest } from "next/server";
import { syncOura } from "@/lib/data/oura";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;
// All-day heart rate is high-volume; default to a trailing week and cap manual
// backfills so a function invocation can't run away.
const DEFAULT_INTRADAY_DAYS = 7;
const MAX_INTRADAY_DAYS = 30;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev convenience when no secret is configured
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Sync Oura data into Supabase (blueprint Phase 2). Guarded by CRON_SECRET,
 * runs daily at 6am via vercel.json, and accepts ?days=N for a manual backfill.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const days = Math.min(
    MAX_DAYS,
    Math.max(1, Number(request.nextUrl.searchParams.get("days")) || DEFAULT_DAYS),
  );
  const intradayDays = Math.min(
    MAX_INTRADAY_DAYS,
    Math.max(
      1,
      Number(request.nextUrl.searchParams.get("intraday")) ||
        DEFAULT_INTRADAY_DAYS,
    ),
  );

  try {
    const result = await syncOura(days, intradayDays);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("not connected") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
