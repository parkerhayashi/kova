import { NextResponse } from "next/server";
import { syncHevy } from "@/lib/data/hevy";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYNC_DAYS = 90;

/** Manual Hevy refresh from the workouts page (session-protected via proxy). */
export async function POST() {
  try {
    const result = await syncHevy(SYNC_DAYS);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("not connected") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
