import { NextResponse, type NextRequest } from "next/server";
import { clampDays, isMuseAuthorized, museJson, museUnauthorized } from "@/lib/muse/auth";
import {
  getRecentActualRuns,
  getRunExtras,
  getTrainingPlan,
  replaceUpcomingPlan,
  type PlanRunInput,
  type TrainingPlanView,
} from "@/lib/data/running";
import { formatPace, kmToMiles, milesToKm, runPaceMinPerKm } from "@/lib/run-fuel";
import type { ActualRun, RunLap, TrainingPlanRun } from "@/types";

export const dynamic = "force-dynamic";

const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

function planRunOut(run: TrainingPlanRun) {
  return {
    id: run.id,
    run_type: run.run_type,
    distance_mi: round1(run.distance_km != null ? kmToMiles(run.distance_km) : null),
    duration_min: run.duration_min,
    notes: run.notes,
    completed_at: run.completed_at,
    actual_run_id: run.actual_run_id,
  };
}

const M_TO_FT = 3.28084;

function lapOut(lap: RunLap) {
  return {
    lap: lap.lap_index,
    distance_mi: round1(lap.distance_km != null ? kmToMiles(lap.distance_km) : null),
    duration_min: lap.duration_min,
    pace: lap.duration_min != null && lap.distance_km ? formatPace(lap.duration_min / lap.distance_km) : null,
    avg_hr: lap.avg_hr,
    avg_cadence_spm: lap.avg_cadence_spm,
    elevation_gain_ft: lap.elevation_gain_m != null ? Math.round(lap.elevation_gain_m * M_TO_FT) : null,
  };
}

function actualOut(run: ActualRun, laps: RunLap[] = []) {
  const pace = runPaceMinPerKm(run);
  return {
    id: run.id,
    date: run.date,
    run_type: run.run_type,
    distance_mi: round1(run.actual_distance_km != null ? kmToMiles(run.actual_distance_km) : null),
    duration_min: run.actual_duration_min,
    pace: pace != null ? formatPace(pace) : null,
    source: run.source,
    // Garmin runs only (null otherwise).
    avg_hr: run.avg_hr,
    max_hr: run.max_hr,
    elevation_gain_ft: run.elevation_gain_m != null ? Math.round(run.elevation_gain_m * M_TO_FT) : null,
    avg_cadence_spm: run.avg_cadence_spm,
    calories: run.calories,
    garmin_metrics: run.metrics,
    laps: laps.length ? laps.map(lapOut) : undefined,
  };
}

function planOut(plan: TrainingPlanView) {
  return {
    next: plan.next ? planRunOut(plan.next) : null,
    upcoming: plan.upcoming.map(planRunOut),
    completed: plan.completed.map(planRunOut),
  };
}

/** Training plan queue + recently logged runs. */
export async function GET(request: NextRequest) {
  const days = clampDays(request.nextUrl.searchParams.get("days"), 30, 120);
  return museJson(request, async () => {
    const [plan, logged] = await Promise.all([getTrainingPlan(20), getRecentActualRuns(days)]);
    const extras = await getRunExtras(logged.filter((r) => r.source === "garmin").map((r) => r.id));
    return {
      ...planOut(plan),
      logged_runs: logged.map((r) => actualOut(r, extras[r.id]?.laps)),
    };
  });
}

type IncomingPlanRun = {
  run_type?: unknown;
  distance_mi?: unknown;
  distance_km?: unknown;
  duration_min?: unknown;
  notes?: unknown;
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Replace the upcoming queue (in order). The only write Muse may make —
 * completed runs, nutrition, and everything else stay read-only.
 */
export async function PUT(request: NextRequest) {
  if (!isMuseAuthorized(request)) return museUnauthorized();
  let body: { runs?: IncomingPlanRun[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON: { runs: [...] }" }, { status: 400 });
  }
  if (!Array.isArray(body?.runs)) {
    return NextResponse.json({ error: "Body must be { runs: [...] }" }, { status: 400 });
  }
  const runs: PlanRunInput[] = body.runs.map((r) => {
    const mi = num(r.distance_mi);
    return {
      run_type: r.run_type as PlanRunInput["run_type"],
      distance_km: mi != null ? milesToKm(mi) : num(r.distance_km),
      duration_min: num(r.duration_min),
      notes: typeof r.notes === "string" ? r.notes.slice(0, 280) : null,
    };
  });
  try {
    return NextResponse.json(planOut(await replaceUpcomingPlan(runs)));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update plan";
    const invalid = /must|needs|at most/i.test(message);
    if (!invalid) console.error("[muse] running-plan", err);
    return NextResponse.json({ error: message }, { status: invalid ? 400 : 500 });
  }
}
