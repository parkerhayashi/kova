import { NextResponse, type NextRequest } from "next/server";
import { syncAllPlaid } from "@/lib/data/finance";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Sync all linked Plaid items (cron + manual). Guarded by CRON_SECRET. */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
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
