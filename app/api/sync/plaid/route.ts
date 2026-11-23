import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized } from "@/lib/cron-auth";
import { syncAllPlaid } from "@/lib/data/finance";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Sync all linked Plaid items (cron + manual). Guarded by CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncAllPlaid();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("No bank") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
