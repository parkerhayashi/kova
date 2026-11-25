import { NextResponse, type NextRequest } from "next/server";
import { isMuseAuthorized, museUnauthorized } from "@/lib/muse/auth";
import { checkInInjury, getInjuries, saveInjury } from "@/lib/data/injuries";
import { BODY_PARTS, INJURY_TYPES, injuryName } from "@/lib/injuries";
import type { InjurySide } from "@/types";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (error: string, extra?: Record<string, unknown>) => NextResponse.json({ error, ...extra }, { status: 400 });

/** Active injuries (with today's level and check-in history); `?all=1` includes resolved. */
export async function GET(request: NextRequest) {
  if (!isMuseAuthorized(request)) return museUnauthorized();
  const all = request.nextUrl.searchParams.get("all") === "1";
  const views = await getInjuries(all);
  return NextResponse.json({
    injuries: views.map((v) => ({
      ...v.injury,
      name: injuryName(v.injury),
      current_severity: v.severity,
      checked_in_today: v.checkedInToday,
      checkins: v.checkins.map((c) => ({ date: c.date, severity: c.severity })),
    })),
  });
}

/**
 * Log a new injury (`body_part`, `side`, `injury_type`, `severity`), or check
 * in on an existing one (`injury_id` + `severity`). Only log what Parker says.
 */
export async function POST(request: NextRequest) {
  if (!isMuseAuthorized(request)) return museUnauthorized();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Body must be JSON");
  }
  const severity = typeof body.severity === "number" ? body.severity : NaN;
  if (!(severity >= 0 && severity <= 10)) return bad("severity must be 0–10");
  try {
    if (typeof body.injury_id === "string") {
      if (!UUID_RE.test(body.injury_id)) return bad("injury_id must be an id from GET /api/muse/injuries");
      await checkInInjury({ injury_id: body.injury_id, severity });
      return NextResponse.json({ checked_in: body.injury_id, severity });
    }
    const bodyPart = String(body.body_part ?? "");
    const type = String(body.injury_type ?? "");
    if (!BODY_PARTS.some((b) => b.key === bodyPart)) {
      return bad("Unknown body_part", { body_parts: BODY_PARTS.map((b) => b.key) });
    }
    if (!INJURY_TYPES.some((t) => t.key === type)) {
      return bad("Unknown injury_type", { injury_types: INJURY_TYPES.map((t) => t.key) });
    }
    const injury = await saveInjury({
      body_part: bodyPart,
      side: (["left", "right", "both", "none"].includes(String(body.side)) ? body.side : "none") as InjurySide,
      injury_type: type,
      severity,
      onset_date: typeof body.onset_date === "string" ? body.onset_date : undefined,
      aggravators: Array.isArray(body.aggravators) ? body.aggravators.map(String) : [],
      symptoms: Array.isArray(body.symptoms) ? body.symptoms.map(String) : [],
      notes: typeof body.notes === "string" ? body.notes : null,
    });
    return NextResponse.json({ logged: { id: injury.id, name: injuryName(injury), severity: injury.severity } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
