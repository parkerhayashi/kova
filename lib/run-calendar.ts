/**
 * Plan Calendar helpers — pure. The calendar shows planned runs (each one a
 * nutrition designation), races, and completed runs. The training plan is a
 * dateless queue and never appears here; see `training_plan_runs`.
 */
import { addDays } from "@/lib/utils";
import { raceTitle, runTypeLabel } from "@/lib/run-fuel";
import type {
  ActualRun,
  CalendarEntry,
  CalendarNutritionStatus,
  GarminActivity,
  PlannedRun,
  RunFuelAdjustment,
  Workout,
} from "@/types";

/**
 * Everything the Plan Calendar renders, as CalendarEntry rows. Nutrition
 * status is derived from the day's adjustment — never set by hand.
 */
export function buildCalendarEntries(input: {
  planned: PlannedRun[];
  actual: ActualRun[];
  adjustments: RunFuelAdjustment[];
}): CalendarEntry[] {
  const statusByDate = new Map<string, CalendarNutritionStatus>();
  for (const adj of input.adjustments) {
    statusByDate.set(adj.date, adj.kind === "carb_load" ? "carb_load" : "fueling");
  }
  const status = (date: string) => statusByDate.get(date) ?? "none";
  const actualByPlan = new Map(
    input.actual
      .filter((a) => a.planned_run_id)
      .map((a) => [a.planned_run_id!, a.id]),
  );

  const entries: CalendarEntry[] = [];
  for (const plan of input.planned) {
    entries.push({
      id: plan.id,
      date: plan.date,
      kind: plan.is_race ? "race" : "planned_run",
      run_type: plan.run_type,
      planned_distance_km: plan.planned_distance_km,
      planned_duration_min: plan.planned_duration_min,
      event_type: plan.event_type,
      nutrition_status: status(plan.date),
      planned_run_id: plan.id,
      actual_run_id: actualByPlan.get(plan.id) ?? null,
      label:
        plan.is_race
          ? raceTitle(plan, plan.planned_distance_km)
          : `${runTypeLabel(plan.run_type)} run`,
    });
  }

  for (const run of input.actual) {
    entries.push({
      id: run.id,
      date: run.date,
      kind: "completed_run",
      run_type: run.run_type,
      planned_distance_km: run.actual_distance_km,
      planned_duration_min: run.actual_duration_min,
      event_type: null,
      nutrition_status: status(run.date),
      planned_run_id: run.planned_run_id,
      actual_run_id: run.id,
      label: run.source === "manual" ? "Run" : `Run · ${run.source === "garmin" ? "Garmin" : "Apple Health"}`,
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

/** Lifts (Hevy) and rides (Garmin) as calendar entries next to the runs. */
export function buildActivityEntries(input: {
  lifts: Pick<Workout, "id" | "date" | "title" | "duration">[];
  rides: GarminActivity[];
}): CalendarEntry[] {
  const base = {
    run_type: null,
    event_type: null,
    nutrition_status: "none" as const,
    planned_run_id: null,
    actual_run_id: null,
  };
  const lifts: CalendarEntry[] = input.lifts
    .filter((w) => w.date)
    .map((w) => ({
      ...base,
      id: w.id,
      date: w.date!,
      kind: "lift",
      planned_distance_km: null,
      planned_duration_min: w.duration != null ? w.duration / 60 : null,
      label: w.title ?? "Lift",
    }));
  const rides: CalendarEntry[] = input.rides.map((r) => ({
    ...base,
    id: r.id,
    date: r.date,
    kind: "ride",
    planned_distance_km: r.distance_km,
    planned_duration_min: r.duration_min,
    label: "Ride",
  }));
  return [...lifts, ...rides];
}

/** Monday = 0 … Sunday = 6 for an ISO date. */
export function weekdayIndex(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
}

export function weekStart(iso: string): string {
  return addDays(iso, -weekdayIndex(iso));
}

/** Monday-start grid covering the month that contains `iso` (whole weeks). */
export function monthGridRange(iso: string): { start: string; end: string } {
  const first = `${iso.slice(0, 7)}-01`;
  const [y, m] = first.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  const last = `${iso.slice(0, 7)}-${String(lastDay).padStart(2, "0")}`;
  return { start: weekStart(first), end: addDays(weekStart(last), 6) };
}
