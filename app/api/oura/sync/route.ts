import { NextResponse } from "next/server";
import { syncOura } from "@/lib/data/oura";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYNC_DAYS = 30;
const INTRADAY_DAYS = 7;

/** Manual Oura refresh from the Today page (session-protected via proxy). */
export async function POST() {
  try {
    const result = await syncOura(SYNC_DAYS, INTRADAY_DAYS);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("not connected") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
