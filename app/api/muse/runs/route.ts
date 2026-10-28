import { NextResponse, type NextRequest } from "next/server";
import { isMuseAuthorized, museUnauthorized } from "@/lib/muse/auth";
import { getTimezone } from "@/lib/data/oura";
import {
  deleteActualRun,
  getActualRun,
  getRunDayState,
  getTrainingPlan,
  saveActualRun,
} from "@/lib/data/running";
import { kmToMiles, milesToKm } from "@/lib/run-fuel";
import { normalizeIsoDate, todayInTimezone } from "@/lib/utils";
import type { RunType } from "@/types";

export const dynamic = "force-dynamic";

const RUN_TYPES = new Set<string>(["easy", "long", "tempo", "intervals", "race"]);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round1 = (n: number) => Math.round(n * 10) / 10;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/**
 * Log a completed run by hand (same record as the Running page form).
 * It matches the day's planned run, reconciles that day's run fuel, and
 * completes the next run in the training plan.
 */
export async function POST(request: NextRequest) {
  if (!isMuseAuthorized(request)) return museUnauthorized();
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return bad("Body must be JSON");
  }

  const today = todayInTimezone(await getTimezone());
  const date = body.date == null ? today : normalizeIsoDate(body.date);
  if (!date) return bad("date must be YYYY-MM-DD");
  if (date > today) return bad("Can't log a run in the future");

  const duration = num(body.duration_min);
  if (duration == null || duration <= 0 || duration > 24 * 60) {
    return bad("duration_min is required (minutes, > 0)");
  }
  const mi = num(body.distance_mi);
  const km = num(body.distance_km);
  if ((mi != null && mi <= 0) || (km != null && km <= 0)) return bad("distance must be > 0");
  if (body.run_type != null && !RUN_TYPES.has(String(body.run_type))) {
    return bad("run_type must be easy, long, tempo, intervals, or race");
  }

  try {
    const run = await saveActualRun({
      date,
      actual_duration_min: duration,
      actual_distance_km: mi != null ? milesToKm(mi) : km,
      run_type: (body.run_type as RunType | undefined) ?? null,
    });
    const [plan, day] = await Promise.all([getTrainingPlan(1), getRunDayState(date)]);
    return NextResponse.json({
      run: {
        id: run.id,
        date: run.date,
        run_type: run.run_type,
        distance_mi: run.actual_distance_km != null ? round1(kmToMiles(run.actual_distance_km)) : null,
        duration_min: run.actual_duration_min,
        reconciled_to_planned_run: run.planned_run_id != null,
      },
      completed_plan_run: plan.completed[0]?.actual_run_id === run.id ? plan.completed[0] : null,
      next_run: plan.next,
      day_run_fuel: day.adjustment
        ? {
            kind: day.adjustment.kind,
            basis: day.adjustment.basis,
            added_carbs_g: day.adjustment.added_carbs_g,
            added_kcal: day.adjustment.added_kcal,
          }
        : null,
    });
  } catch (err) {
    console.error("[muse] log run", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to log run" },
      { status: 500 },
    );
  }
}

/** Undo a mistaken manual log (`?id=`). Garmin-synced runs can't be deleted here. */
export async function DELETE(request: NextRequest) {
  if (!isMuseAuthorized(request)) return museUnauthorized();
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !UUID_RE.test(id)) return bad("id must be a run id from logged_runs");
  try {
    const run = await getActualRun(id);
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });
    if (run.source !== "manual") return bad("Only manually logged runs can be deleted");
    await deleteActualRun(id);
    return NextResponse.json({ deleted: id });
  } catch (err) {
    console.error("[muse] delete run", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete run" },
      { status: 500 },
    );
  }
}
