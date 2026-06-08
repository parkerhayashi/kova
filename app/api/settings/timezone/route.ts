import { NextResponse, type NextRequest } from "next/server";
import { setTimezone } from "@/lib/data/oura";

export const dynamic = "force-dynamic";

/** Reject anything that isn't a real IANA zone the runtime understands. */
function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Persist the browser-detected display timezone (blueprint §4 — times shown in
 * the user's local zone). Called by the client TimezoneSync component whenever
 * the detected zone differs from what's stored, so travel updates it.
 */
export async function POST(request: NextRequest) {
  let timezone: unknown;
  try {
    ({ timezone } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof timezone !== "string" || !isValidTimeZone(timezone)) {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }

  const stored = await setTimezone(timezone);
  if (stored === null) {
    return NextResponse.json(
      { error: "Could not store timezone" },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, timezone: stored });
}
