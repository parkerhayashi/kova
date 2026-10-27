/**
 * Training plan phases → prescribed runs on the Plan Calendar.
 *
 * Prescribed runs are read-only and generated from this table; they never
 * enroll a day in nutrition (that's always a separate manual designation).
 * Add later phases by appending to TRAINING_PHASES.
 */
import { addDays, daysBetween } from "@/lib/utils";
import { milesToKm, raceEventLabel, runTypeLabel } from "@/lib/run-fuel";
import type {
  ActualRun,
  CalendarEntry,
  CalendarNutritionStatus,
  CalendarRun,
  PlannedRun,
  RunFuelAdjustment,
  RunType,
} from "@/types";

/** 0 = Monday … 6 = Sunday (weeks start on the phase's start_date). */
export type PlanWeekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type PrescribedRun = {
  weekday: PlanWeekday;
  run_type: Exclude<RunType, "race">;
  distance_mi?: number;
  duration_min?: number;
  note?: string;
};

export type TrainingPhase = {
  id: string;
  name: string;
  /** Monday the phase begins (YYYY-MM-DD). */
  start_date: string;
  /** weeks[i] = prescribed runs for week i + 1. */
  weeks: PrescribedRun[][];
};

/**
 * Phase 1 — 8-week base build toward the 10 mile.
 * TODO(parker): fill in the 8-week Phase 1 table (start Monday + weekly runs).
 */
export const TRAINING_PHASES: TrainingPhase[] = [];

/** Prescribed runs on dates in [start, end] (inclusive). */
export function prescribedRunsBetween(
  start: string,
  end: string,
  phases: TrainingPhase[] = TRAINING_PHASES,
): CalendarEntry[] {
  const out: CalendarEntry[] = [];
  for (const phase of phases) {
    phase.weeks.forEach((runs, weekIndex) => {
      for (const run of runs) {
        const date = addDays(phase.start_date, weekIndex * 7 + run.weekday);
        if (daysBetween(date, start) < 0 || daysBetween(end, date) < 0) continue;
        out.push({
          id: `plan:${phase.id}:${weekIndex + 1}:${run.weekday}`,
          date,
          kind: "prescribed_run",
          source: "plan",
          run_type: run.run_type,
          planned_distance_km:
            run.distance_mi != null ? milesToKm(run.distance_mi) : null,
          planned_duration_min: run.duration_min ?? null,
          event_type: null,
          nutrition_status: "none",
          planned_run_id: null,
          actual_run_id: null,
          label: `${phase.name} · Wk ${weekIndex + 1}${run.note ? ` · ${run.note}` : ""}`,
        });
      }
    });
  }
  return out;
}

/**
 * Everything the Plan Calendar renders, as CalendarEntry rows. Nutrition
 * status is derived from the day's adjustment — never set by hand.
 */
export function buildCalendarEntries(input: {
  prescribed: CalendarEntry[];
  planned: PlannedRun[];
  actual: ActualRun[];
  adjustments: RunFuelAdjustment[];
  calendarRuns: CalendarRun[];
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

  const entries: CalendarEntry[] = input.prescribed.map((entry) => ({
    ...entry,
    nutrition_status: status(entry.date),
  }));

  for (const run of input.calendarRuns) {
    entries.push({
      id: run.id,
      date: run.date,
      kind: "planned_run",
      source: "user",
      run_type: run.run_type,
      planned_distance_km: run.planned_distance_km,
      planned_duration_min: run.planned_duration_min,
      event_type: null,
      nutrition_status: status(run.date),
      planned_run_id: run.planned_run_id,
      actual_run_id: run.planned_run_id ? actualByPlan.get(run.planned_run_id) ?? null : null,
      label: run.notes || `${runTypeLabel(run.run_type)} run`,
    });
  }

  for (const race of input.planned.filter((p) => p.is_race)) {
    entries.push({
      id: race.id,
      date: race.date,
      kind: "race",
      source: "user",
      run_type: "race",
      planned_distance_km: race.planned_distance_km,
      planned_duration_min: race.planned_duration_min,
      event_type: race.event_type,
      nutrition_status: status(race.date),
      planned_run_id: race.id,
      actual_run_id: actualByPlan.get(race.id) ?? null,
      label: race.event_type ? raceEventLabel(race.event_type) : "Race",
    });
  }

  for (const run of input.actual) {
    entries.push({
      id: run.id,
      date: run.date,
      kind: "completed_run",
      source: "user",
      run_type: run.run_type,
      planned_distance_km: run.actual_distance_km,
      planned_duration_min: run.actual_duration_min,
      event_type: null,
      nutrition_status: status(run.date),
      planned_run_id: run.planned_run_id,
      actual_run_id: run.id,
      label: run.source === "garmin" ? "Run · Garmin" : "Run",
    });
  }

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

/** Monday = 0 … Sunday = 6 for an ISO date. */
export function weekdayIndex(iso: string): PlanWeekday {
  const [y, m, d] = iso.split("-").map(Number);
  return ((new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7) as PlanWeekday;
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
