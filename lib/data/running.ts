/**
 * Server-side data layer for running nutrition, the Plan Calendar, and the
 * training plan queue.
 *
 * Every write that can change a day's targets ends in `recomputeDay(date)`,
 * which rebuilds that day's single run_fuel_adjustments row from the records
 * (idempotent — re-running on the same data yields the same row). Carb-load
 * rows are written by race designation and are never touched by recompute.
 *
 * Import only from Server Components, Server Actions, and route handlers.
 * lib/data/nutrition imports this module, so it's only loaded lazily here.
 */
import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getTimezone, getUserSettings } from "@/lib/data/oura";
import { getLatestWeight } from "@/lib/data/tracking";
import { lbsToKg } from "@/lib/nutrition-goals";
import {
  carbLoadTargets,
  clampCarbsPerHour,
  computeRunFuel,
  DEFAULT_EASY_PACE_MIN_PER_KM,
  estimateDurationMin,
  GEL_DEFAULT,
  planCarbLoad,
  qualifiesForFueling,
  RACE_EVENTS,
  raceEventSpec,
  type CarbLoadPlan,
  type RaceEventRef,
  type FuelRun,
} from "@/lib/run-fuel";
import { buildCalendarEntries } from "@/lib/run-calendar";
import { addDays, daysBetween, normalizeIsoDate, todayInTimezone } from "@/lib/utils";
import type {
  ActualRun,
  ActualRunSource,
  CalendarEntry,
  FuelProduct,
  MidRunIntake,
  PlannedRun,
  PlannedRunStatus,
  RaceEventType,
  RunFuelAdjustment,
  RunLap,
  RunMetrics,
  RunStreamPoints,
  RunType,
  TrainingPlanRun,
} from "@/types";

function day(value: string): string {
  return normalizeIsoDate(value) ?? value;
}

function withDate<T extends { date: string }>(row: T): T {
  return { ...row, date: day(row.date) };
}

function asPlanned(row: PlannedRun): PlannedRun {
  return {
    ...row,
    date: day(row.date),
    event_date: row.event_date ? day(row.event_date) : null,
  };
}

async function today(): Promise<{ today: string; timezone: string }> {
  const timezone = await getTimezone();
  return { today: todayInTimezone(timezone), timezone };
}

/** Calendar date of a timestamp in the user's zone. */
function dateInTimezone(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
    new Date(iso),
  );
}

export const getRunFuelCarbsPerHour = cache(async function getRunFuelCarbsPerHour(): Promise<number> {
  const settings = await getUserSettings();
  return clampCarbsPerHour(settings?.run_fuel_carbs_per_hour);
});

export async function setRunFuelCarbsPerHour(rate: number): Promise<number> {
  const value = clampCarbsPerHour(rate);
  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!row) throw new Error("Settings not found");
  const { error } = await db
    .from("user_settings")
    .update({ run_fuel_carbs_per_hour: value })
    .eq("id", (row as { id: string }).id);
  if (error) throw new Error(error.message);

  // Re-run today's and upcoming fuel days at the new rate; past days stay.
  const { today: now } = await today();
  const { data: upcoming } = await db
    .from("run_fuel_adjustments")
    .select("date")
    .eq("kind", "run_fuel")
    .gte("date", now);
  for (const r of (upcoming as { date: string }[]) ?? []) await recomputeDay(day(r.date));
  return value;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function plannedRunsOn(date: string): Promise<PlannedRun[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("planned_runs")
    .select("*")
    .eq("date", date)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as PlannedRun[]) ?? []).map(asPlanned);
}

async function actualRunsOn(date: string): Promise<ActualRun[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("actual_runs")
    .select("*")
    .eq("date", date)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as ActualRun[]) ?? []).map(withDate);
}

async function adjustmentOn(date: string): Promise<RunFuelAdjustment | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("run_fuel_adjustments")
    .select("*")
    .eq("date", date)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? withDate(data as RunFuelAdjustment) : null;
}

async function getPlannedRun(id: string): Promise<PlannedRun | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("planned_runs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? asPlanned(data as PlannedRun) : null;
}

/**
 * Median recent easy pace (min/km) from logged runs, then Oura workouts,
 * then a 10:00/mi default. Used to estimate duration from distance.
 */
export async function getRecentEasyPace(): Promise<{
  pace_min_per_km: number;
  source: "runs" | "oura" | "default";
}> {
  const { today: now } = await today();
  const since = addDays(now, -90);
  const db = createServiceClient();

  const [{ data: actual }, { data: planned }] = await Promise.all([
    db
      .from("actual_runs")
      .select("run_type, planned_run_id, actual_distance_km, actual_duration_min")
      .gte("date", since)
      .not("actual_distance_km", "is", null),
    db.from("planned_runs").select("id, run_type").gte("date", since),
  ]);
  const plannedType = new Map(
    ((planned as { id: string; run_type: RunType }[]) ?? []).map((p) => [
      p.id,
      p.run_type,
    ]),
  );
  const paces = (
    (actual as Pick<
      ActualRun,
      "run_type" | "planned_run_id" | "actual_distance_km" | "actual_duration_min"
    >[]) ?? []
  )
    .filter((run) => {
      const type =
        run.run_type ??
        (run.planned_run_id ? plannedType.get(run.planned_run_id) : null) ??
        "easy";
      return type === "easy" && (run.actual_distance_km ?? 0) > 0.5;
    })
    .map((run) => run.actual_duration_min / run.actual_distance_km!);
  const fromRuns = median(paces);
  if (fromRuns != null) return { pace_min_per_km: fromRuns, source: "runs" };

  const { data: oura } = await db
    .from("oura_workouts")
    .select("activity, distance, start_datetime, end_datetime")
    .gte("day", since)
    .ilike("activity", "%run%");
  const ouraPaces = (
    (oura as {
      distance: number | null;
      start_datetime: string | null;
      end_datetime: string | null;
    }[]) ?? []
  )
    .filter((w) => w.distance && w.distance > 500 && w.start_datetime && w.end_datetime)
    .map((w) => {
      const min =
        (Date.parse(w.end_datetime!) - Date.parse(w.start_datetime!)) / 60_000;
      return min / (w.distance! / 1000);
    })
    // Drop walks / GPS junk: keep 4:00–15:00 min/km.
    .filter((pace) => pace >= 4 && pace <= 15);
  const fromOura = median(ouraPaces);
  if (fromOura != null) return { pace_min_per_km: fromOura, source: "oura" };

  return { pace_min_per_km: DEFAULT_EASY_PACE_MIN_PER_KM, source: "default" };
}

function median(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[mid]! : (finite[mid - 1]! + finite[mid]!) / 2;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

/**
 * Rebuild the day's run_fuel adjustment from its plans + actual runs.
 * - Actual runs (with any still-pending plans) drive it once they exist.
 * - Otherwise pending planned runs drive an "estimated" adjustment.
 * - Below threshold / skipped / nothing → the row is removed.
 * Carb-load days are left alone (no stacking; load days don't reconcile).
 */
/** Garmin training-effect labels that make a ride a hard session (60-min fuel threshold). */
const HARD_RIDE_LABELS = /TEMPO|THRESHOLD|VO2|ANAEROBIC|SPEED/i;

/** A day's Garmin rides as fuel inputs: hard rides count like tempo runs, the rest like easy ones. */
async function ridesOn(date: string): Promise<FuelRun[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("garmin_activities")
    .select("duration_min, anaerobic_te, metrics")
    .eq("sport", "cycling")
    .eq("date", date);
  // Ride fuel is additive — without the table the day falls back to runs only.
  if (error) return [];
  return ((data as { duration_min: number; anaerobic_te: number | null; metrics: RunMetrics | null }[]) ?? []).map(
    (r) => ({
      run_type:
        HARD_RIDE_LABELS.test(r.metrics?.te_label ?? "") || (r.anaerobic_te ?? 0) >= 2 ? "tempo" : "easy",
      duration_min: r.duration_min,
    }),
  );
}

export async function recomputeDay(date: string): Promise<void> {
  const target = day(date);
  const [existing, planned, actual, rate, rides] = await Promise.all([
    adjustmentOn(target),
    plannedRunsOn(target),
    actualRunsOn(target),
    getRunFuelCarbsPerHour(),
    ridesOn(target),
  ]);
  if (existing?.kind === "carb_load") return;

  const plannedById = new Map(planned.map((p) => [p.id, p]));
  const linked = new Set(actual.map((a) => a.planned_run_id).filter(Boolean));
  const pending = planned.filter(
    (p) => p.status === "planned" && !linked.has(p.id),
  );

  const actualRuns: FuelRun[] = actual.map((a) => ({
    run_type:
      a.run_type ??
      (a.planned_run_id ? plannedById.get(a.planned_run_id)?.run_type : null) ??
      null,
    duration_min: a.actual_duration_min,
  }));
  const pendingRuns: FuelRun[] = pending.map((p) => ({
    run_type: p.run_type,
    duration_min: p.planned_duration_min,
  }));

  const pendingQualifies = pendingRuns.some((r) =>
    qualifiesForFueling(r.run_type, r.duration_min),
  );
  // Long rides fuel like long runs; they're always actual (rides aren't planned ahead).
  const computed = computeRunFuel({
    runs: [...actualRuns, ...rides, ...pendingRuns],
    basis: actual.length + rides.length > 0 && !pendingQualifies ? "actual" : "planned",
    carbsPerHour: rate,
  });

  const db = createServiceClient();
  if (!computed) {
    if (existing) {
      const { error } = await db
        .from("run_fuel_adjustments")
        .delete()
        .eq("date", target)
        .eq("kind", "run_fuel");
      if (error) throw new Error(error.message);
    }
    return;
  }

  const anchor =
    planned.find((p) => p.is_race) ??
    planned.find(
      (p) =>
        p.status !== "skipped" &&
        qualifiesForFueling(p.run_type, p.planned_duration_min),
    ) ??
    null;

  const { error } = await db.from("run_fuel_adjustments").upsert(
    {
      date: target,
      basis: computed.basis,
      kind: "run_fuel",
      planned_run_id: anchor?.id ?? null,
      load_day_index: null,
      load_day_count: null,
      added_carbs_g: computed.added_carbs_g,
      added_kcal: computed.added_kcal,
      added_protein_g: 0,
      added_fat_g: 0,
      target_carbs_g: null,
      target_fat_g: null,
      carbs_g_per_kg: null,
      basis_duration_min: computed.basis_duration_min,
      computed_at: new Date().toISOString(),
    },
    { onConflict: "date" },
  );
  if (error) throw new Error(error.message);
}

/**
 * End-of-day rule: a plan with no actual run by the end of its day is
 * skipped and its estimate removed — never carried into the next day.
 */
export const sweepStalePlannedRuns = cache(async function sweepStalePlannedRuns(): Promise<void> {
  const { today: now } = await today();
  const db = createServiceClient();
  const { data, error } = await db
    .from("planned_runs")
    .select("id, date")
    .eq("status", "planned")
    .lt("date", now);
  if (error || !data?.length) return;

  const stale = data as { id: string; date: string }[];
  const { data: linked } = await db
    .from("actual_runs")
    .select("planned_run_id")
    .in(
      "planned_run_id",
      stale.map((p) => p.id),
    );
  const completed = new Set(
    ((linked as { planned_run_id: string }[]) ?? []).map((r) => r.planned_run_id),
  );

  const dates = new Set<string>();
  for (const plan of stale) {
    await db
      .from("planned_runs")
      .update({
        status: completed.has(plan.id) ? "completed" : "skipped",
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan.id);
    dates.add(day(plan.date));
  }
  for (const date of dates) await recomputeDay(date);
});

export type RunDayState = {
  adjustment: RunFuelAdjustment | null;
  event: RaceEventRef | null;
  has_runs: boolean;
  adjustment_removed: boolean;
  unplanned: boolean;
};

const MODE_1: RunDayState = {
  adjustment: null,
  event: null,
  has_runs: false,
  adjustment_removed: false,
  unplanned: false,
};

/**
 * Inputs for layering the day's run state onto nutrition goals. Fails soft to
 * Mode 1 (base targets) so nutrition never breaks on a running-table error.
 */
export const getRunDayState = cache(async function getRunDayState(date: string): Promise<RunDayState> {
  try {
    return await readRunDayState(day(date));
  } catch (err) {
    console.error("[running] run day state unavailable", err);
    return MODE_1;
  }
});

async function readRunDayState(target: string): Promise<RunDayState> {
  await sweepStalePlannedRuns();
  const [adjustment, planned, actual] = await Promise.all([
    adjustmentOn(target),
    plannedRunsOn(target),
    actualRunsOn(target),
  ]);

  let event: RaceEventRef | null = null;
  const race =
    (adjustment?.planned_run_id
      ? planned.find((p) => p.id === adjustment.planned_run_id) ??
        (await getPlannedRun(adjustment.planned_run_id))
      : null) ?? planned.find((p) => p.is_race);
  if (race?.is_race) {
    event = {
      event_type: race.event_type,
      event_date: race.event_date ?? race.date,
      event_distance_km: race.planned_distance_km,
      event_name: race.race_name,
    };
  }

  return {
    adjustment,
    event,
    has_runs: planned.length > 0 || actual.length > 0,
    adjustment_removed:
      !adjustment &&
      planned.some((p) => qualifiesForFueling(p.run_type, p.planned_duration_min)),
    unplanned: actual.some((a) => !a.planned_run_id),
  };
}

/** Carb-load dates since `sinceDays` ago — exempt from adaptive TDEE / drift. */
export const getCarbLoadDates = cache(async function getCarbLoadDates(sinceDays: number): Promise<Set<string>> {
  const { today: now } = await today();
  const db = createServiceClient();
  const { data } = await db
    .from("run_fuel_adjustments")
    .select("date")
    .eq("kind", "carb_load")
    .gte("date", addDays(now, -sinceDays));
  return new Set(((data as { date: string }[]) ?? []).map((r) => day(r.date)));
});

/** Drop carb-load days from an intake map before adaptive / drift math. */
export function withoutDates<V>(map: Map<string, V>, dates: Set<string>): Map<string, V> {
  if (dates.size === 0) return map;
  const out = new Map<string, V>();
  for (const [date, value] of map) if (!dates.has(date)) out.set(date, value);
  return out;
}

// ---------------------------------------------------------------------------
// Mid-run intake (gels, chews, drink mix)
// ---------------------------------------------------------------------------

export type IntakeTotals = { carbs_g: number; kcal: number };

export async function getMidRunIntakesForDate(date: string): Promise<MidRunIntake[]> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("mid_run_intakes")
    .select("*")
    .eq("date", day(date))
    .order("logged_at", { ascending: true });
  // Intake totals feed every nutrition read — degrade to "none" on error.
  if (error) {
    console.error("[running] mid-run intake unavailable", error.message);
    return [];
  }
  return ((data as MidRunIntake[]) ?? []).map(withDate);
}

export function sumIntakes(rows: Pick<MidRunIntake, "carbs_g" | "kcal">[]): IntakeTotals {
  return rows.reduce(
    (acc, row) => ({
      carbs_g: acc.carbs_g + (row.carbs_g ?? 0),
      kcal: acc.kcal + (row.kcal ?? 0),
    }),
    { carbs_g: 0, kcal: 0 },
  );
}

/** Mid-run intake per day since `since` (inclusive). */
export async function getMidRunIntakeByDay(
  since: string,
): Promise<Map<string, IntakeTotals>> {
  const db = createServiceClient();
  const { data } = await db
    .from("mid_run_intakes")
    .select("date, carbs_g, kcal")
    .gte("date", since);
  const map = new Map<string, IntakeTotals>();
  for (const row of (data as Pick<MidRunIntake, "date" | "carbs_g" | "kcal">[]) ?? []) {
    const date = day(row.date);
    const prev = map.get(date) ?? { carbs_g: 0, kcal: 0 };
    map.set(date, {
      carbs_g: prev.carbs_g + (row.carbs_g ?? 0),
      kcal: prev.kcal + (row.kcal ?? 0),
    });
  }
  return map;
}

export type RunRef = {
  planned_run_id?: string | null;
  actual_run_id?: string | null;
  /** A Garmin ride, when the day has no run. */
  activity_id?: string | null;
};

/** What a day's fuel attaches to: the actual run, else the plan, else the day's ride. */
export async function fuelRunRefForDate(date: string): Promise<RunRef | null> {
  const target = day(date);
  const db = createServiceClient();
  const [planned, actual, rides] = await Promise.all([
    plannedRunsOn(target),
    actualRunsOn(target),
    db.from("garmin_activities").select("id").eq("sport", "cycling").eq("date", target).limit(1),
  ]);
  if (actual[0]) {
    return { actual_run_id: actual[0].id, planned_run_id: actual[0].planned_run_id };
  }
  const plan = planned.find((p) => p.status !== "skipped");
  if (plan) return { planned_run_id: plan.id };
  const ride = (rides.data as { id: string }[] | null)?.[0];
  return ride ? { activity_id: ride.id } : null;
}

/**
 * Log on-run fuel. With `product_id` the saved product's numbers are copied;
 * otherwise label / carbs / kcal are taken as given (default: a generic gel).
 */
export async function addMidRunIntake(
  input: RunRef & {
    date: string;
    product_id?: string | null;
    label?: string;
    carbs_g?: number;
    kcal?: number;
    caffeine_mg?: number | null;
    taken_at_min?: number | null;
  },
): Promise<MidRunIntake> {
  if (!input.planned_run_id && !input.actual_run_id && !input.activity_id) {
    throw new Error("Log fuel against a run or a ride.");
  }
  const product = input.product_id ? await getFuelProduct(input.product_id) : null;
  if (input.product_id && !product) throw new Error("Fuel product not found");
  const carbs = product?.carbs_g ?? input.carbs_g ?? GEL_DEFAULT.carbs_g;
  const kcal = product?.kcal ?? input.kcal ?? GEL_DEFAULT.kcal;
  const caffeine = product ? product.caffeine_mg : input.caffeine_mg ?? null;
  if (!(carbs >= 0) || !(kcal >= 0)) throw new Error("Carbs and calories must be ≥ 0");
  if (caffeine != null && !(caffeine >= 0)) throw new Error("Caffeine must be ≥ 0");
  const db = createServiceClient();
  const { data, error } = await db
    .from("mid_run_intakes")
    .insert({
      date: day(input.date),
      planned_run_id: input.planned_run_id ?? null,
      actual_run_id: input.actual_run_id ?? null,
      activity_id: input.activity_id ?? null,
      product_id: product?.id ?? null,
      label: product?.name ?? (input.label?.trim() || GEL_DEFAULT.label),
      carbs_g: carbs,
      kcal,
      caffeine_mg: caffeine,
      taken_at_min: input.taken_at_min ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return withDate(data as MidRunIntake);
}

// ---------------------------------------------------------------------------
// Fuel products — saved gels / chews / drink mixes
// ---------------------------------------------------------------------------

export async function getFuelProducts(): Promise<FuelProduct[]> {
  const db = createServiceClient();
  const { data, error } = await db.from("fuel_products").select("*").order("name");
  // The fuel card still works with the generic gel if the table is missing.
  if (error) {
    console.error("[running] fuel products unavailable", error.message);
    return [];
  }
  return (data as FuelProduct[]) ?? [];
}

async function getFuelProduct(id: string): Promise<FuelProduct | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("fuel_products").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FuelProduct | null) ?? null;
}

/** Match a product by name: exact (case-insensitive) first, then a unique partial match. */
export function matchFuelProduct(
  products: FuelProduct[],
  query: string,
): { product: FuelProduct | null; candidates: FuelProduct[] } {
  const q = query.trim().toLowerCase();
  const exact = products.find((p) => p.name.toLowerCase() === q);
  if (exact) return { product: exact, candidates: [exact] };
  const partial = products.filter(
    (p) => p.name.toLowerCase().includes(q) || q.includes(p.name.toLowerCase()),
  );
  return { product: partial.length === 1 ? partial[0]! : null, candidates: partial };
}

export async function saveFuelProduct(input: {
  id?: string;
  name: string;
  carbs_g: number;
  kcal?: number | null;
  caffeine_mg?: number | null;
}): Promise<FuelProduct> {
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new Error("Give the product a name");
  if (!(input.carbs_g >= 0)) throw new Error("Carbs must be ≥ 0");
  const kcal = input.kcal ?? Math.round(input.carbs_g * 4);
  if (!(kcal >= 0)) throw new Error("Calories must be ≥ 0");
  if (input.caffeine_mg != null && !(input.caffeine_mg >= 0)) {
    throw new Error("Caffeine must be ≥ 0");
  }
  const row = {
    name,
    carbs_g: input.carbs_g,
    kcal,
    caffeine_mg: input.caffeine_mg ?? null,
    updated_at: new Date().toISOString(),
  };
  const db = createServiceClient();
  const { data, error } = input.id
    ? await db.from("fuel_products").update(row).eq("id", input.id).select("*").single()
    : await db.from("fuel_products").insert(row).select("*").single();
  if (error) {
    throw new Error(error.code === "23505" ? `You already have a product named "${name}"` : error.message);
  }
  return data as FuelProduct;
}

/** Past logs keep their copied numbers; only the link is cleared. */
export async function deleteFuelProduct(id: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("fuel_products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMidRunIntake(id: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("mid_run_intakes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Mode 2 — planned run designation
// ---------------------------------------------------------------------------

export type PlannedRunInput = {
  id?: string;
  date: string;
  run_type: Exclude<RunType, "race">;
  planned_distance_km?: number | null;
  planned_duration_min?: number | null;
};

export async function savePlannedRun(
  input: PlannedRunInput,
): Promise<{ planned: PlannedRun; qualifies: boolean }> {
  const date = normalizeIsoDate(input.date);
  if (!date) throw new Error("A valid date is required");
  const distance = positive(input.planned_distance_km);
  let duration = positive(input.planned_duration_min);
  let estimated = false;
  if (duration == null) {
    if (distance == null) throw new Error("Enter a distance or a duration");
    const pace = await getRecentEasyPace();
    duration = estimateDurationMin(distance, pace.pace_min_per_km);
    estimated = true;
  }

  const previous = input.id ? await getPlannedRun(input.id) : null;
  if (input.id && !previous) throw new Error("Planned run not found");
  if (previous?.is_race) throw new Error("Edit races from the Plan Calendar");

  const db = createServiceClient();
  const row = {
    date,
    run_type: input.run_type,
    planned_distance_km: distance,
    planned_duration_min: duration,
    duration_estimated: estimated,
    event_type: null,
    race_name: null,
    is_race: false,
    event_date: null,
    status: previous?.status === "completed" ? "completed" : "planned",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = previous
    ? await db.from("planned_runs").update(row).eq("id", previous.id).select("*").single()
    : await db.from("planned_runs").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  const planned = asPlanned(data as PlannedRun);

  await recomputeDay(date);
  if (previous && previous.date !== date) await recomputeDay(previous.date);
  return {
    planned,
    qualifies: qualifiesForFueling(planned.run_type, planned.planned_duration_min),
  };
}

/** Mark a plan skipped (removes its adjustment) or back to planned. */
export async function setPlannedRunStatus(
  id: string,
  status: Exclude<PlannedRunStatus, "completed">,
): Promise<void> {
  const plan = await getPlannedRun(id);
  if (!plan) throw new Error("Planned run not found");
  const db = createServiceClient();
  const { error } = await db
    .from("planned_runs")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
  if (plan.is_race) {
    if (status === "skipped") await clearFutureLoad(plan.id);
    else await regenerateRaceLoad(plan, { designatedOnOverride: null });
  }
  await recomputeDay(plan.date);
}

/** Remove a designation (Mode 2 or race). Logged gels stay logged. */
export async function deletePlannedRun(id: string): Promise<void> {
  const plan = await getPlannedRun(id);
  if (!plan) return;
  const removedLoad = plan.is_race ? await clearFutureLoad(plan.id) : [];
  const db = createServiceClient();
  const { error } = await db.from("planned_runs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await recomputeDay(plan.date);
  for (const date of removedLoad) await recomputeDay(date);
}

function positive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Mode 3 — races (entered only from the Plan Calendar)
// ---------------------------------------------------------------------------

export type RaceInput = {
  id?: string;
  event_type: RaceEventType;
  race_name?: string | null;
  event_date: string;
  planned_distance_km?: number | null;
  planned_duration_min?: number | null;
};

/** Base macros the load is measured against (today's base target). */
export type LoadBase = { carbs_g: number; fat_g: number };

/** Delete this race's load days from today on; past load days stay logged. */
async function clearFutureLoad(plannedRunId: string): Promise<string[]> {
  const { today: now } = await today();
  const db = createServiceClient();
  const { data } = await db
    .from("run_fuel_adjustments")
    .select("date")
    .eq("planned_run_id", plannedRunId)
    .eq("kind", "carb_load")
    .gte("date", now);
  const dates = ((data as { date: string }[]) ?? []).map((r) => day(r.date));
  if (dates.length > 0) {
    const { error } = await db
      .from("run_fuel_adjustments")
      .delete()
      .eq("planned_run_id", plannedRunId)
      .eq("kind", "carb_load")
      .gte("date", now);
    if (error) throw new Error(error.message);
  }
  return dates;
}

/** Today's base macros (no run fuel). Dynamic import: nutrition imports this module. */
async function todaysLoadBase(): Promise<LoadBase> {
  const { getBaseNutritionGoals } = await import("@/lib/data/nutrition");
  const base = await getBaseNutritionGoals();
  return { carbs_g: base.carbs_g, fat_g: base.fat_g };
}

async function regenerateRaceLoad(
  race: PlannedRun,
  opts: { designatedOnOverride: string | null; base?: LoadBase },
): Promise<CarbLoadPlan> {
  if (!race.event_type || !race.event_date) {
    throw new Error("Race is missing its event type or date");
  }
  const { today: now, timezone } = await today();
  const designatedOn =
    opts.designatedOnOverride ??
    (race.designated_at ? dateInTimezone(race.designated_at, timezone) : now);

  const plan = planCarbLoad({
    event_type: race.event_type,
    distance_km: race.planned_distance_km,
    event_date: race.event_date,
    designated_on: designatedOn,
  });

  const cleared = await clearFutureLoad(race.id);
  const writeDates =
    race.status === "skipped" ? [] : plan.load_dates.filter((d) => d >= now);

  if (writeDates.length > 0) {
    const base = opts.base ?? (await todaysLoadBase());
    const weight = await getLatestWeight();
    if (!weight) throw new Error("Log a weigh-in first — the carb load is set per kg.");
    const loads = carbLoadTargets({
      event_type: race.event_type,
      distance_km: race.planned_distance_km,
      weight_kg: lbsToKg(weight.weight_lbs),
      base,
    });
    const db = createServiceClient();
    const rows = writeDates.map((date) => ({
      date,
      basis: "planned" as const,
      kind: "carb_load" as const,
      planned_run_id: race.id,
      load_day_index: plan.load_dates.indexOf(date) + 1,
      load_day_count: plan.load_dates.length,
      added_carbs_g: loads.added_carbs_g,
      added_kcal: loads.added_kcal,
      added_protein_g: 0,
      added_fat_g: loads.added_fat_g,
      target_carbs_g: loads.target_carbs_g,
      target_fat_g: loads.target_fat_g,
      carbs_g_per_kg: loads.carbs_g_per_kg,
      basis_duration_min: null,
      computed_at: new Date().toISOString(),
    }));
    // One adjustment per day: a load day replaces any run_fuel row there.
    const { error } = await db
      .from("run_fuel_adjustments")
      .upsert(rows, { onConflict: "date" });
    if (error) throw new Error(error.message);
  }

  // Days that stopped being load days fall back to Mode 1 / Mode 2.
  for (const date of cleared) {
    if (!writeDates.includes(date)) await recomputeDay(date);
  }
  return plan;
}

export async function saveRace(
  input: RaceInput,
  base?: LoadBase,
): Promise<{ race: PlannedRun; load: CarbLoadPlan }> {
  const eventDate = normalizeIsoDate(input.event_date);
  if (!eventDate) throw new Error("A valid race date is required");
  const customKm = positive(input.planned_distance_km);
  if (input.event_type === "custom" && customKm == null) {
    throw new Error("Enter the race distance");
  }
  if (input.event_type !== "custom" && !RACE_EVENTS[input.event_type]) {
    throw new Error("Pick 10 mile, half marathon, marathon, or a custom distance");
  }
  const event = raceEventSpec(input.event_type, customKm);

  const previous = input.id ? await getPlannedRun(input.id) : null;
  if (input.id && !previous?.is_race) throw new Error("Race not found");

  const distance = customKm ?? event.distance_km;
  let duration = positive(input.planned_duration_min);
  let estimated = false;
  if (duration == null) {
    const pace = await getRecentEasyPace();
    duration = estimateDurationMin(distance, pace.pace_min_per_km);
    estimated = true;
  }

  const { today: now } = await today();
  // Moving the date is a re-designation: lead time is re-validated from today.
  const dateMoved = !previous || previous.event_date !== eventDate;
  const designated_at =
    dateMoved || !previous?.designated_at
      ? new Date().toISOString()
      : previous.designated_at;

  const db = createServiceClient();
  const row = {
    date: eventDate,
    run_type: "race" as const,
    planned_distance_km: distance,
    planned_duration_min: duration,
    duration_estimated: estimated,
    event_type: input.event_type,
    race_name: input.race_name?.trim().slice(0, 80) || null,
    is_race: true,
    event_date: eventDate,
    designated_at,
    status: previous?.status === "completed" ? "completed" : "planned",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = previous
    ? await db.from("planned_runs").update(row).eq("id", previous.id).select("*").single()
    : await db.from("planned_runs").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  const race = asPlanned(data as PlannedRun);

  const load = await regenerateRaceLoad(race, {
    designatedOnOverride: dateMoved ? now : null,
    base,
  });
  await recomputeDay(eventDate);
  if (previous && previous.date !== eventDate) await recomputeDay(previous.date);
  return { race, load };
}

// ---------------------------------------------------------------------------
// Actual runs — manual entry now; Garmin sync writes the same records
// ---------------------------------------------------------------------------

/** Link an actual run to the day's unmatched plan (planned first, then skipped). */
async function matchPlannedRun(date: string): Promise<PlannedRun | null> {
  const [planned, actual] = await Promise.all([
    plannedRunsOn(date),
    actualRunsOn(date),
  ]);
  const linked = new Set(actual.map((a) => a.planned_run_id).filter(Boolean));
  const open = planned.filter((p) => !linked.has(p.id));
  return (
    open.find((p) => p.status === "planned") ??
    open.find((p) => p.status === "skipped") ??
    null
  );
}

async function markCompleted(plannedRunId: string | null): Promise<void> {
  if (!plannedRunId) return;
  const db = createServiceClient();
  await db
    .from("planned_runs")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", plannedRunId);
}

export type ActualRunInput = {
  id?: string;
  date: string;
  actual_duration_min: number;
  actual_distance_km?: number | null;
  run_type?: RunType | null;
  /** Explicit plan to reconcile against; omitted → matched by date. */
  planned_run_id?: string | null;
  started_at?: string | null;
};

export async function saveActualRun(input: ActualRunInput): Promise<ActualRun> {
  const date = normalizeIsoDate(input.date);
  if (!date) throw new Error("A valid date is required");
  const duration = positive(input.actual_duration_min);
  if (duration == null) throw new Error("Enter the run's duration");

  const db = createServiceClient();
  const previous = input.id
    ? ((await db.from("actual_runs").select("*").eq("id", input.id).maybeSingle())
        .data as ActualRun | null)
    : null;
  if (input.id && !previous) throw new Error("Run not found");

  let plannedRunId =
    input.planned_run_id !== undefined
      ? input.planned_run_id
      : previous?.planned_run_id ?? null;
  if (!previous && input.planned_run_id === undefined) {
    plannedRunId = (await matchPlannedRun(date))?.id ?? null;
  }

  const row = {
    date,
    planned_run_id: plannedRunId,
    run_type: input.run_type ?? null,
    actual_distance_km: positive(input.actual_distance_km),
    actual_duration_min: duration,
    started_at: input.started_at ?? null,
    source: previous?.source ?? ("manual" as ActualRunSource),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = previous
    ? await db.from("actual_runs").update(row).eq("id", previous.id).select("*").single()
    : await db.from("actual_runs").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  const run = withDate(data as ActualRun);

  await markCompleted(run.planned_run_id);
  if (!previous) await completeNextPlanRun(run.id, run.date);
  if (previous?.planned_run_id && previous.planned_run_id !== run.planned_run_id) {
    await reopenIfOrphaned(previous.planned_run_id);
  }
  await recomputeDay(date);
  if (previous && day(previous.date) !== date) await recomputeDay(day(previous.date));
  return run;
}

/** A plan whose actual run was removed goes back to planned (or skipped if past). */
async function reopenIfOrphaned(plannedRunId: string): Promise<void> {
  const db = createServiceClient();
  const { count } = await db
    .from("actual_runs")
    .select("id", { count: "exact", head: true })
    .eq("planned_run_id", plannedRunId);
  if ((count ?? 0) > 0) return;
  const plan = await getPlannedRun(plannedRunId);
  if (!plan) return;
  const { today: now } = await today();
  await db
    .from("planned_runs")
    .update({
      status: plan.date < now ? "skipped" : "planned",
      updated_at: new Date().toISOString(),
    })
    .eq("id", plannedRunId);
  await recomputeDay(plan.date);
}

export async function deleteActualRun(id: string): Promise<void> {
  const db = createServiceClient();
  const { data } = await db.from("actual_runs").select("*").eq("id", id).maybeSingle();
  const run = data as ActualRun | null;
  if (!run) return;
  // A deleted import stays deleted — later syncs must not bring it back.
  if (run.external_id) {
    await db
      .from("dismissed_run_imports")
      .upsert({ external_id: run.external_id }, { onConflict: "external_id" });
  }
  // The plan item this run completed goes back to upcoming.
  await db
    .from("training_plan_runs")
    .update({ actual_run_id: null, completed_at: null, updated_at: new Date().toISOString() })
    .eq("actual_run_id", id);
  const { error } = await db.from("actual_runs").delete().eq("id", id);
  if (error) throw new Error(error.message);
  if (run.planned_run_id) await reopenIfOrphaned(run.planned_run_id);
  await recomputeDay(day(run.date));
}

/** A completed run from a wearable sync (Garmin, Oura). */
export type IncomingRun = {
  external_id: string;
  /** Date the run started, in the user's zone (runs crossing midnight stay here). */
  date: string;
  started_at?: string | null;
  duration_min: number;
  distance_km?: number | null;
  run_type?: RunType | null;
  /** Garmin only: summary metrics, plus laps / trace from the .FIT file. */
  detail?: IncomingRunDetail;
};

export type IncomingRunDetail = Pick<
  ActualRun,
  "avg_hr" | "max_hr" | "elevation_gain_m" | "avg_cadence_spm" | "calories" | "metrics"
> & {
  /** Omitted when the .FIT file wasn't fetched this sync — stored laps stay. */
  laps?: Omit<RunLap, "id" | "actual_run_id">[];
  stream?: RunStreamPoints | null;
};

/**
 * When two records describe the same run, the higher one wins. Garmin has
 * the most detail, so it beats even a hand-typed log; "oura" is Apple Health
 * relayed through Oura (that's where runs are recorded today).
 */
const SOURCE_PRIORITY: Record<ActualRunSource, number> = { garmin: 3, manual: 2, oura: 1 };

/** Should `incoming` replace `existing` as the record of the same run? */
export function takesPriority(incoming: ActualRunSource, existing: ActualRunSource): boolean {
  return SOURCE_PRIORITY[incoming] > SOURCE_PRIORITY[existing];
}

/**
 * Same run? Overlapping time windows when both have a start time; otherwise
 * same day with durations within max(10 min, 25%).
 */
export function sameRun(
  a: { started_at: string | null; duration_min: number },
  b: { started_at: string | null; duration_min: number },
): boolean {
  if (a.started_at && b.started_at) {
    const aStart = Date.parse(a.started_at);
    const bStart = Date.parse(b.started_at);
    const aEnd = aStart + a.duration_min * 60_000;
    const bEnd = bStart + b.duration_min * 60_000;
    return aStart < bEnd && bStart < aEnd;
  }
  const diff = Math.abs(a.duration_min - b.duration_min);
  return diff <= Math.max(10, 0.25 * Math.max(a.duration_min, b.duration_min));
}

/** An already-logged run on `date` that looks like this one, if any. */
export async function findSameRun(
  date: string,
  run: { started_at?: string | null; duration_min: number },
): Promise<ActualRun | null> {
  const existing = await actualRunsOn(day(date));
  return (
    existing.find((e) =>
      sameRun(
        { started_at: e.started_at, duration_min: e.actual_duration_min },
        { started_at: run.started_at ?? null, duration_min: run.duration_min },
      ),
    ) ?? null
  );
}

/**
 * Source-agnostic import used by wearable syncs. Idempotent:
 * - Known external_id → refreshed in place (only by the source that owns it).
 * - Overlaps a run already logged → the higher-priority record wins
 *   (garmin > manual > oura), so one run is never counted twice.
 * - Dismissed imports (deleted by the user) are never re-imported.
 * - Otherwise inserted, matched to the day's plan, and reconciled.
 */
export async function ingestActualRuns(
  source: Exclude<ActualRunSource, "manual">,
  runs: IncomingRun[],
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const db = createServiceClient();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const touched = new Set<string>();

  const ids = runs.map((r) => r.external_id).filter(Boolean);
  const { data: dismissedRows } = ids.length
    ? await db.from("dismissed_run_imports").select("external_id").in("external_id", ids)
    : { data: [] };
  const dismissed = new Set(
    ((dismissedRows as { external_id: string }[]) ?? []).map((r) => r.external_id),
  );

  for (const incoming of runs) {
    const date = normalizeIsoDate(incoming.date);
    const duration = positive(incoming.duration_min);
    if (!date || duration == null || !incoming.external_id || dismissed.has(incoming.external_id)) {
      skipped++;
      continue;
    }

    const detail = incoming.detail;
    const fields = {
      date,
      started_at: incoming.started_at ?? null,
      actual_duration_min: duration,
      actual_distance_km: positive(incoming.distance_km),
      source,
      external_id: incoming.external_id,
      ...(detail
        ? {
            avg_hr: detail.avg_hr,
            max_hr: detail.max_hr,
            elevation_gain_m: detail.elevation_gain_m,
            avg_cadence_spm: detail.avg_cadence_spm,
            calories: detail.calories,
            metrics: detail.metrics,
          }
        : {}),
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await db
      .from("actual_runs")
      .select("*")
      .eq("external_id", incoming.external_id)
      .maybeSingle();
    const prev = existing as ActualRun | null;

    if (prev) {
      if (prev.source !== source) {
        skipped++;
        continue;
      }
      const { error } = await db
        .from("actual_runs")
        .update({ ...fields, run_type: incoming.run_type ?? prev.run_type ?? null })
        .eq("id", prev.id);
      if (error) throw new Error(error.message);
      if (detail) await saveRunExtras(prev.id, detail);
      updated++;
      if (day(prev.date) !== date) touched.add(day(prev.date));
      touched.add(date);
      continue;
    }

    const overlap = await findSameRun(date, { started_at: fields.started_at, duration_min: duration });
    if (overlap) {
      if (!takesPriority(source, overlap.source)) {
        skipped++;
        continue;
      }
      // Better record of the same run (Garmin over a manual or Apple Health
      // log): take it over, keeping the row id so plan / fuel links survive
      // and the run type set by hand stays unless Garmin sends one.
      const { error } = await db
        .from("actual_runs")
        .update({ ...fields, run_type: incoming.run_type ?? overlap.run_type ?? null })
        .eq("id", overlap.id);
      if (error) throw new Error(error.message);
      if (detail) await saveRunExtras(overlap.id, detail);
      updated++;
      touched.add(date);
      continue;
    }

    const match = await matchPlannedRun(date);
    const { data: created, error } = await db
      .from("actual_runs")
      .insert({ ...fields, run_type: incoming.run_type ?? null, planned_run_id: match?.id ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const createdId = (created as { id: string }).id;
    if (detail) await saveRunExtras(createdId, detail);
    await markCompleted(match?.id ?? null);
    await completeNextPlanRun(createdId, date);
    inserted++;
    touched.add(date);
  }

  for (const date of touched) await recomputeDay(date);
  return { inserted, updated, skipped };
}

/** Replace a run's laps and trace when the sync brought them. */
async function saveRunExtras(runId: string, detail: IncomingRunDetail): Promise<void> {
  const db = createServiceClient();
  if (detail.laps) {
    const { error: delError } = await db.from("run_laps").delete().eq("actual_run_id", runId);
    if (delError) throw new Error(delError.message);
    if (detail.laps.length > 0) {
      const { error } = await db
        .from("run_laps")
        .insert(detail.laps.map((lap) => ({ ...lap, actual_run_id: runId })));
      if (error) throw new Error(error.message);
    }
  }
  if (detail.stream) {
    const { error } = await db
      .from("run_streams")
      .upsert({ actual_run_id: runId, points: detail.stream }, { onConflict: "actual_run_id" });
    if (error) throw new Error(error.message);
  }
}

/** External ids (of `ids`) whose run already has laps stored — no need to re-fetch the .FIT. */
export async function externalIdsWithLaps(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const db = createServiceClient();
  const { data, error } = await db
    .from("actual_runs")
    .select("external_id, run_laps(count)")
    .in("external_id", ids);
  if (error) throw new Error(error.message);
  return new Set(
    ((data as { external_id: string; run_laps: { count: number }[] }[]) ?? [])
      .filter((r) => (r.run_laps[0]?.count ?? 0) > 0)
      .map((r) => r.external_id),
  );
}

/** Laps and trace for the given runs (the Running day view's detail panel). */
export async function getRunExtras(
  runIds: string[],
): Promise<Record<string, { laps: RunLap[]; stream: RunStreamPoints | null }>> {
  const out: Record<string, { laps: RunLap[]; stream: RunStreamPoints | null }> = {};
  if (runIds.length === 0) return out;
  for (const id of runIds) out[id] = { laps: [], stream: null };
  const db = createServiceClient();
  const [laps, streams] = await Promise.all([
    db.from("run_laps").select("*").in("actual_run_id", runIds).order("lap_index"),
    db.from("run_streams").select("actual_run_id, points").in("actual_run_id", runIds),
  ]);
  // Detail is extra — the day view still renders if these tables are unavailable.
  if (laps.error || streams.error) {
    console.error("[running] run detail unavailable", laps.error?.message ?? streams.error?.message);
    return out;
  }
  for (const lap of (laps.data as RunLap[]) ?? []) out[lap.actual_run_id]?.laps.push(lap);
  for (const row of (streams.data as { actual_run_id: string; points: RunStreamPoints }[]) ?? []) {
    if (out[row.actual_run_id]) out[row.actual_run_id]!.stream = row.points;
  }
  return out;
}

/** Oura activity labels that count as runs. */
const OURA_RUN_ACTIVITY = /run|jog/i;
/** Oura sometimes logs a few minutes of jogging between sets — ignore blips. */
const MIN_IMPORTED_RUN_MIN = 10;

/**
 * Import runs from the synced oura_workouts table (Apple Health runs relayed
 * through Oura, plus anything Oura detects itself) over the last
 * `sinceDays` (default two weeks). Safe to call on every Oura sync.
 */
export async function importOuraRuns(
  sinceDays = 14,
): Promise<{ inserted: number; updated: number; skipped: number }> {
  const { today: now, timezone } = await today();
  const db = createServiceClient();
  const { data, error } = await db
    .from("oura_workouts")
    .select("oura_id, day, activity, distance, start_datetime, end_datetime")
    .gte("day", addDays(now, -sinceDays))
    .order("day", { ascending: true });
  if (error) throw new Error(error.message);

  const runs: IncomingRun[] = [];
  for (const w of (data as {
    oura_id: string;
    day: string | null;
    activity: string | null;
    distance: number | null;
    start_datetime: string | null;
    end_datetime: string | null;
  }[]) ?? []) {
    if (!OURA_RUN_ACTIVITY.test(w.activity ?? "") || !w.start_datetime || !w.end_datetime) continue;
    const minutes = (Date.parse(w.end_datetime) - Date.parse(w.start_datetime)) / 60_000;
    if (!(minutes >= MIN_IMPORTED_RUN_MIN)) continue;
    runs.push({
      external_id: `oura:${w.oura_id}`,
      date: w.day ? day(w.day) : dateInTimezone(w.start_datetime, timezone),
      started_at: w.start_datetime,
      duration_min: Math.round(minutes),
      distance_km: w.distance && w.distance > 0 ? w.distance / 1000 : null,
    });
  }
  return ingestActualRuns("oura", runs);
}

// ---------------------------------------------------------------------------
// Training plan — an ordered queue of runs (type + mileage, no dates).
// Edited by hand on /running or by Muse. A logged run completes the head of
// the queue; the plan never touches nutrition on its own.
// ---------------------------------------------------------------------------

export type TrainingPlanView = {
  /** First upcoming run, or null when the queue is empty. */
  next: TrainingPlanRun | null;
  upcoming: TrainingPlanRun[];
  /** Most recently completed, newest first. */
  completed: TrainingPlanRun[];
};

export async function getTrainingPlan(completedLimit = 10): Promise<TrainingPlanView> {
  const db = createServiceClient();
  const [upcoming, completed] = await Promise.all([
    db
      .from("training_plan_runs")
      .select("*")
      .is("actual_run_id", null)
      .order("position", { ascending: true }),
    db
      .from("training_plan_runs")
      .select("*")
      .not("actual_run_id", "is", null)
      .order("completed_at", { ascending: false })
      .limit(completedLimit),
  ]);
  if (upcoming.error) throw new Error(upcoming.error.message);
  const queue = ((upcoming.data as TrainingPlanRun[]) ?? []);
  return {
    next: queue[0] ?? null,
    upcoming: queue,
    completed: ((completed.data as TrainingPlanRun[]) ?? []),
  };
}

/** Mark the head of the queue done by this logged run (no-op if empty). */
/**
 * Mark the head of the queue done by this logged run (no-op if empty). A run
 * only completes a plan item that already existed on the run's date, so
 * importing older runs (e.g. an Oura backfill) never eats the current plan.
 */
async function completeNextPlanRun(actualRunId: string, runDate: string): Promise<void> {
  const db = createServiceClient();
  const { data } = await db
    .from("training_plan_runs")
    .select("id, created_at")
    .is("actual_run_id", null)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return;
  const { timezone } = await today();
  const head = data as { id: string; created_at: string };
  if (dateInTimezone(head.created_at, timezone) > runDate) return;
  const now = new Date().toISOString();
  await db
    .from("training_plan_runs")
    .update({ actual_run_id: actualRunId, completed_at: now, updated_at: now })
    .eq("id", head.id);
}

export type PlanRunInput = {
  run_type: TrainingPlanRun["run_type"];
  distance_km?: number | null;
  duration_min?: number | null;
  notes?: string | null;
};

function planRunFields(input: PlanRunInput) {
  if (!RUN_TYPE_SET.has(input.run_type)) {
    throw new Error("run_type must be easy, long, tempo, or intervals");
  }
  const distance = positive(input.distance_km);
  const duration = positive(input.duration_min);
  if (distance == null && duration == null) {
    throw new Error("Each plan run needs a distance or a duration");
  }
  return {
    run_type: input.run_type,
    distance_km: distance,
    duration_min: duration,
    notes: input.notes?.trim() || null,
  };
}

const RUN_TYPE_SET = new Set<string>(["easy", "long", "tempo", "intervals"]);

async function lastPosition(): Promise<number> {
  const db = createServiceClient();
  const { data } = await db
    .from("training_plan_runs")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { position: number } | null)?.position ?? 0;
}

/** Add to the end of the queue, or edit an existing upcoming run. */
export async function saveTrainingPlanRun(
  input: PlanRunInput & { id?: string },
): Promise<TrainingPlanRun> {
  const db = createServiceClient();
  const fields = { ...planRunFields(input), updated_at: new Date().toISOString() };
  const { data, error } = input.id
    ? await db.from("training_plan_runs").update(fields).eq("id", input.id).select("*").single()
    : await db
        .from("training_plan_runs")
        .insert({ ...fields, position: (await lastPosition()) + 1 })
        .select("*")
        .single();
  if (error) throw new Error(error.message);
  return data as TrainingPlanRun;
}

export async function deleteTrainingPlanRun(id: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("training_plan_runs").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Swap an upcoming run with its neighbour. */
export async function moveTrainingPlanRun(id: string, direction: "up" | "down"): Promise<void> {
  const { upcoming } = await getTrainingPlan(0);
  const index = upcoming.findIndex((r) => r.id === id);
  const other = upcoming[direction === "up" ? index - 1 : index + 1];
  if (index < 0 || !other) return;
  const current = upcoming[index]!;
  const db = createServiceClient();
  const now = new Date().toISOString();
  await db.from("training_plan_runs").update({ position: other.position, updated_at: now }).eq("id", current.id);
  await db.from("training_plan_runs").update({ position: current.position, updated_at: now }).eq("id", other.id);
}

/**
 * Replace every upcoming run with `runs`, in order (Muse's write path).
 * Completed runs are history and are never touched. Validates everything
 * before writing so a bad payload changes nothing.
 */
export async function replaceUpcomingPlan(runs: PlanRunInput[]): Promise<TrainingPlanView> {
  if (!Array.isArray(runs)) throw new Error("runs must be an array");
  if (runs.length > 200) throw new Error("At most 200 upcoming runs");
  const rows = runs.map(planRunFields);

  // Insert the new queue first, then drop the old one — a failed insert
  // leaves the existing plan intact.
  const { upcoming: old } = await getTrainingPlan(0);
  const db = createServiceClient();
  if (rows.length > 0) {
    const base = await lastPosition();
    const { error } = await db.from("training_plan_runs").insert(
      rows.map((row, i) => ({ ...row, position: base + i + 1 })),
    );
    if (error) throw new Error(error.message);
  }
  if (old.length > 0) {
    const { error } = await db
      .from("training_plan_runs")
      .delete()
      .in("id", old.map((r) => r.id));
    if (error) throw new Error(error.message);
  }
  return getTrainingPlan();
}

// ---------------------------------------------------------------------------
// Running page view
// ---------------------------------------------------------------------------

export type RunningRange = {
  start: string;
  end: string;
  planned: PlannedRun[];
  actual: ActualRun[];
  adjustments: RunFuelAdjustment[];
  intakes: MidRunIntake[];
  entries: CalendarEntry[];
};

export async function getRunningRange(start: string, end: string): Promise<RunningRange> {
  await sweepStalePlannedRuns();
  const db = createServiceClient();
  const [planned, actual, adjustments, intakes] = await Promise.all([
    db.from("planned_runs").select("*").gte("date", start).lte("date", end).order("date"),
    db.from("actual_runs").select("*").gte("date", start).lte("date", end).order("date"),
    db.from("run_fuel_adjustments").select("*").gte("date", start).lte("date", end),
    db.from("mid_run_intakes").select("*").gte("date", start).lte("date", end).order("logged_at"),
  ]);
  for (const res of [planned, actual, adjustments, intakes]) {
    if (res.error) throw new Error(res.error.message);
  }

  const view = {
    start,
    end,
    planned: ((planned.data as PlannedRun[]) ?? []).map(asPlanned),
    actual: ((actual.data as ActualRun[]) ?? []).map(withDate),
    adjustments: ((adjustments.data as RunFuelAdjustment[]) ?? []).map(withDate),
    intakes: ((intakes.data as MidRunIntake[]) ?? []).map(withDate),
  };
  return { ...view, entries: buildCalendarEntries(view) };
}

/** Logged runs over the last `days`, newest first (for Muse's plan upkeep). */
export async function getRecentActualRuns(days: number): Promise<ActualRun[]> {
  const { today: now } = await today();
  const db = createServiceClient();
  const { data, error } = await db
    .from("actual_runs")
    .select("*")
    .gte("date", addDays(now, -days))
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data as ActualRun[]) ?? []).map(withDate);
}

export async function getActualRun(id: string): Promise<ActualRun | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("actual_runs").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? withDate(data as ActualRun) : null;
}

/** What Home's Running card needs: today's run (done or planned) and the next plan run. */
export type RunningSnapshot = {
  /** Runs logged today, summed (null when none). */
  today_done: {
    distance_km: number | null;
    duration_min: number;
    source: ActualRunSource;
    /** Average heart rate when a Garmin run reported one. */
    avg_hr: number | null;
  } | null;
  /** Today's planned run or race that isn't done yet. */
  today_planned: Pick<
    PlannedRun,
    "run_type" | "planned_distance_km" | "planned_duration_min" | "is_race" | "event_type" | "race_name"
  > | null;
  next: TrainingPlanRun | null;
  /** The next race within RACE_HORIZON_DAYS, with its carb-load window. */
  next_race: UpcomingRace | null;
};

/** Home shows the race countdown this far out. */
const RACE_HORIZON_DAYS = 365;

export type UpcomingRace = {
  id: string;
  date: string;
  name: string | null;
  event_type: RaceEventType | null;
  distance_km: number | null;
  days_until: number;
  /** First carb-load day (null when no load applies, e.g. designated too late). */
  load_start: string | null;
  load_days: number;
  load_carbs_g: number | null;
};

/** Earliest planned race from `date` on, plus its stored carb-load days. */
export async function getUpcomingRace(date: string): Promise<UpcomingRace | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("planned_runs")
    .select("*")
    .eq("is_race", true)
    .eq("status", "planned")
    .gte("date", date)
    .lte("date", addDays(date, RACE_HORIZON_DAYS))
    .order("date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[running] upcoming race unavailable", error.message);
    return null;
  }
  if (!data) return null;
  const race = asPlanned(data as PlannedRun);
  const { data: loads } = await db
    .from("run_fuel_adjustments")
    .select("date, target_carbs_g")
    .eq("planned_run_id", race.id)
    .eq("kind", "carb_load")
    .order("date", { ascending: true });
  const loadRows = (loads as { date: string; target_carbs_g: number | null }[]) ?? [];
  const raceDate = race.event_date ?? race.date;
  return {
    id: race.id,
    date: raceDate,
    name: race.race_name,
    event_type: race.event_type,
    distance_km: race.planned_distance_km,
    days_until: daysBetween(raceDate, date),
    load_start: loadRows[0] ? day(loadRows[0].date) : null,
    load_days: loadRows.length,
    load_carbs_g: loadRows[0]?.target_carbs_g ?? null,
  };
}

export const getRunningSnapshot = cache(async function getRunningSnapshot(
  date: string,
): Promise<RunningSnapshot> {
  const target = day(date);
  const [planned, actual, plan, next_race] = await Promise.all([
    plannedRunsOn(target),
    actualRunsOn(target),
    getTrainingPlan(0),
    getUpcomingRace(target),
  ]);
  const distance = actual.reduce((sum, a) => sum + (a.actual_distance_km ?? 0), 0);
  const linked = new Set(actual.map((a) => a.planned_run_id));
  const open = planned.find((p) => p.status === "planned" && !linked.has(p.id)) ?? null;
  return {
    today_done: actual.length
      ? {
          distance_km: distance > 0 ? distance : null,
          duration_min: actual.reduce((sum, a) => sum + a.actual_duration_min, 0),
          source: actual[0]!.source,
          avg_hr: actual.find((a) => a.avg_hr != null)?.avg_hr ?? null,
        }
      : null,
    today_planned: open,
    next: plan.next,
    next_race,
  };
});

/** Run-fuel / carb-load rows dated in [start, end], keyed by date. */
export async function getRunFuelAdjustmentsBetween(
  start: string,
  end: string,
): Promise<Map<string, RunFuelAdjustment>> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("run_fuel_adjustments")
    .select("*")
    .gte("date", start)
    .lte("date", end);
  // Charts degrade to base targets rather than failing the page.
  if (error) {
    console.error("[running] adjustments unavailable", error.message);
    return new Map();
  }
  return new Map(
    ((data as RunFuelAdjustment[]) ?? []).map((row) => [day(row.date), withDate(row)]),
  );
}
