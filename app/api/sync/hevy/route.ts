import { NextResponse, type NextRequest } from "next/server";
import { syncHevy } from "@/lib/data/hevy";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DEFAULT_DAYS = 90;
const MAX_DAYS = 365;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function wantsFullImport(request: NextRequest): boolean {
  const q = request.nextUrl.searchParams.get("all");
  return q === "1" || q === "true";
}

/** Daily Hevy import — guarded by CRON_SECRET, scheduled in vercel.json. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (wantsFullImport(request)) {
    try {
      const result = await syncHevy({ all: true });
      return NextResponse.json({ ok: true, ...result });
    } catch (err) {
      const message = (err as Error).message;
      const status = message.includes("not connected") ? 400 : 502;
      return NextResponse.json({ error: message }, { status });
    }
  }

  const days = Math.min(
    MAX_DAYS,
    Math.max(1, Number(request.nextUrl.searchParams.get("days")) || DEFAULT_DAYS),
  );

  try {
    const result = await syncHevy({ days });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("not connected") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
