import { NextResponse } from "next/server";
import { getSupplements, getSupplementLogs } from "@/lib/data/tracking";
import { getTimezone } from "@/lib/data/oura";
import { todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET() {
  const [supplements, logs, tz] = await Promise.all([
    getSupplements(true),
    getSupplementLogs(1),
    getTimezone(),
  ]);
  const today = todayInTimezone(tz);
  const taken = new Set(
    logs.filter((l) => l.date === today && l.taken).map((l) => l.supplement_id),
  );
  const done = supplements.filter((s) => taken.has(s.id)).length;
  return NextResponse.json({ supplements: { done, total: supplements.length } });
}
