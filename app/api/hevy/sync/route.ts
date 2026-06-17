import { NextResponse, type NextRequest } from "next/server";
import { syncHevy } from "@/lib/data/hevy";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SYNC_DAYS = 90;

function wantsFullImport(request: NextRequest): boolean {
  const q = request.nextUrl.searchParams.get("all");
  return q === "1" || q === "true";
}

/** Manual Hevy refresh from the workouts page (session-protected via proxy). */
export async function POST(request: NextRequest) {
  try {
    const result = await syncHevy(
      wantsFullImport(request) ? { all: true } : { days: SYNC_DAYS },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = (err as Error).message;
    const status = message.includes("not connected") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
