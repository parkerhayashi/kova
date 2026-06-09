import { NextResponse } from "next/server";
import { syncAllPlaid } from "@/lib/data/finance";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Manual sync from the /finances UI (protected by app session, not CRON_SECRET). */
export async function POST() {
  try {
    const result = await syncAllPlaid();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("No bank") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
