/**
 * Running nutrition math (Kova Running Nutrition Spec, Oct 2026). Pure — no DB.
 *
 * Mode 1: no run / easy run under threshold → base targets, untouched.
 * Mode 2: fueling run → base + a separate run-fuel line (carbs only), planned
 *         estimate first, reconciled to the actual run afterwards.
 * Mode 3: race → multi-day carb load (g/kg) before the event + Mode 2 fueling
 *         on race day.
 */
import { addDays, daysBetween } from "@/lib/utils";
import type {
  ComputedNutritionGoals,
  NutritionGoalMeta,
} from "@/lib/nutrition-goals";
import type {
  PresetRaceEventType,
  RaceEventType,
  RunFuelAdjustment,
  RunFuelBasis,
  RunFuelKind,
  RunType,
} from "@/types";

export const KM_PER_MILE = 1.609_344;

/** Any run longer than this (minutes) needs fuel, regardless of type. */
export const FUEL_THRESHOLD_MIN = 75;
/** Hard sessions (tempo / intervals / race) longer than this need fuel. */
export const HARD_FUEL_THRESHOLD_MIN = 60;
/** The first hour of running is covered by normal meals. */
export const UNFUELED_FIRST_MIN = 60;

export const MIN_CARBS_PER_HOUR = 30;
export const MAX_CARBS_PER_HOUR = 60;
export const DEFAULT_CARBS_PER_HOUR = 45;

export const GEL_DEFAULT = { label: "Gel", carbs_g: 25, kcal: 100 } as const;

/** Carb-load fat target on load days — fat drops to ~30–40 g to make room. */
export const LOAD_DAY_FAT_G = 35;
/** Fallback easy pace when there's no run history (min per km ≈ 10:00/mi). */
export const DEFAULT_EASY_PACE_MIN_PER_KM = 10 / KM_PER_MILE;

export const RUN_TYPES: RunType[] = ["easy", "long", "tempo", "intervals"];

export type RaceEventSpec = {
  label: string;
  distance_km: number;
  /** Load window in days before the event. */
  load_days: number;
  /** g carbs per kg bodyweight per day — midpoint is the default. */
  carbs_g_per_kg: { min: number; max: number; default: number };
};

export const RACE_EVENTS: Record<PresetRaceEventType, RaceEventSpec> = {
  ten_mile: {
    label: "10 mile",
    distance_km: 10 * KM_PER_MILE,
    load_days: 1,
    carbs_g_per_kg: { min: 8, max: 10, default: 9 },
  },
  half_marathon: {
    label: "Half marathon",
    distance_km: 21.0975,
    load_days: 2,
    carbs_g_per_kg: { min: 8, max: 10, default: 9 },
  },
  marathon: {
    label: "Marathon",
    distance_km: 42.195,
    load_days: 2,
    carbs_g_per_kg: { min: 10, max: 12, default: 11 },
  },
};

/**
 * Load rules for a race. Presets use their own; a custom distance borrows the
 * longest preset it covers (14 mi → half marathon), never less than 10 mile.
 */
export function raceEventSpec(
  type: RaceEventType,
  distance_km?: number | null,
): RaceEventSpec {
  if (type !== "custom") return RACE_EVENTS[type];
  const km = distance_km ?? 0;
  const presets = Object.values(RACE_EVENTS).sort((a, b) => a.distance_km - b.distance_km);
  // Small tolerance so "13.1" or "26.2" typed in miles still lands on the preset.
  const rules = presets.filter((e) => e.distance_km <= km + 0.1).pop() ?? presets[0];
  return { ...rules, label: raceEventLabel("custom", km || null), distance_km: km };
}

export function runTypeLabel(type: RunType): string {
  switch (type) {
    case "easy":
      return "Easy";
    case "long":
      return "Long";
    case "tempo":
      return "Tempo";
    case "intervals":
      return "Intervals";
    case "race":
      return "Race";
  }
}

export function isHardRun(type: RunType | null | undefined): boolean {
  return type === "tempo" || type === "intervals" || type === "race";
}

/** Does this run need extra fuel? Evaluated on the plan and again on the actual. */
export function qualifiesForFueling(
  type: RunType | null | undefined,
  durationMin: number | null | undefined,
): boolean {
  if (durationMin == null || !Number.isFinite(durationMin)) return false;
  if (durationMin > FUEL_THRESHOLD_MIN) return true;
  return isHardRun(type) && durationMin > HARD_FUEL_THRESHOLD_MIN;
}

export function clampCarbsPerHour(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return DEFAULT_CARBS_PER_HOUR;
  return Math.round(
    Math.max(MIN_CARBS_PER_HOUR, Math.min(MAX_CARBS_PER_HOUR, raw)),
  );
}

/** Added carbs: rate × hours of running beyond the first hour. */
export function runFuelCarbs(
  durationMin: number,
  carbsPerHour: number = DEFAULT_CARBS_PER_HOUR,
): number {
  const fuelingHours = Math.max(0, durationMin - UNFUELED_FIRST_MIN) / 60;
  return Math.round(fuelingHours * clampCarbsPerHour(carbsPerHour));
}

/**
 * Suggested gels: ~1 per 30–45 min after the first 60–75 min.
 * 90 min → 1; 2 h → 1–2.
 */
export function suggestedGels(durationMin: number | null | undefined): {
  min: number;
  max: number;
} {
  if (durationMin == null || durationMin <= FUEL_THRESHOLD_MIN) {
    return { min: 0, max: 0 };
  }
  const min = Math.max(1, Math.ceil((durationMin - FUEL_THRESHOLD_MIN) / 45));
  const max = Math.max(min, Math.floor((durationMin - UNFUELED_FIRST_MIN) / 30));
  return { min, max };
}

export function formatGelRange(range: { min: number; max: number }): string {
  if (range.max === 0) return "No gels needed";
  const count =
    range.min === range.max ? `${range.min}` : `${range.min}–${range.max}`;
  return `${count} gel${range.max === 1 ? "" : "s"}`;
}

/** Duration from distance at a pace (min/km). */
export function estimateDurationMin(
  distanceKm: number,
  paceMinPerKm: number = DEFAULT_EASY_PACE_MIN_PER_KM,
): number {
  return Math.round(distanceKm * paceMinPerKm);
}

export function kmToMiles(km: number): number {
  return km / KM_PER_MILE;
}

export function milesToKm(mi: number): number {
  return mi * KM_PER_MILE;
}

export function formatDistance(km: number | null | undefined): string {
  if (km == null) return "—";
  return `${Math.round(kmToMiles(km) * 10) / 10} mi`;
}

export function formatRunDuration(min: number | null | undefined): string {
  if (min == null) return "—";
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m} min`;
}

export function formatPace(minPerKm: number | null | undefined): string {
  if (minPerKm == null || !Number.isFinite(minPerKm)) return "—";
  const total = Math.round(minPerKm * KM_PER_MILE * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}/mi`;
}

/** Average pace of a run (min per km), or null without a distance. */
export function runPaceMinPerKm(run: {
  actual_duration_min: number;
  actual_distance_km: number | null;
}): number | null {
  return run.actual_distance_km && run.actual_distance_km > 0
    ? run.actual_duration_min / run.actual_distance_km
    : null;
}

/** One-line quick view under a run: pace · avg HR · elevation gain. */
export function runQuickStats(run: {
  actual_duration_min: number;
  actual_distance_km: number | null;
  avg_hr: number | null;
  elevation_gain_m: number | null;
}): string | null {
  const pace = runPaceMinPerKm(run);
  const parts = [
    pace != null ? formatPace(pace) : null,
    run.avg_hr != null ? `${Math.round(run.avg_hr)} bpm avg` : null,
    run.elevation_gain_m != null ? `${Math.round(run.elevation_gain_m * 3.28084)} ft gain` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

/** A run that feeds the day's fuel calculation. */
export type FuelRun = {
  run_type: RunType | null;
  duration_min: number | null;
};

export type RunFuelComputation = {
  basis: RunFuelBasis;
  added_carbs_g: number;
  added_kcal: number;
  basis_duration_min: number;
};

/**
 * Day-level run fuel: sum durations of threshold-relevant runs (two runs in a
 * day → one adjustment), then apply the formula. Null = no adjustment.
 */
export function computeRunFuel(input: {
  runs: FuelRun[];
  basis: RunFuelBasis;
  carbsPerHour?: number | null;
}): RunFuelComputation | null {
  const relevant = input.runs.filter((run) =>
    qualifiesForFueling(run.run_type, run.duration_min),
  );
  if (relevant.length === 0) return null;
  const total = relevant.reduce((sum, run) => sum + (run.duration_min ?? 0), 0);
  const carbs = runFuelCarbs(total, clampCarbsPerHour(input.carbsPerHour));
  return {
    basis: input.basis,
    added_carbs_g: carbs,
    added_kcal: carbs * 4,
    basis_duration_min: Math.round(total),
  };
}

// ---------------------------------------------------------------------------
// Mode 3 — race designation + carb load
// ---------------------------------------------------------------------------

export type LeadTimeStatus = "full" | "truncated" | "race_only";

export type CarbLoadPlan = {
  status: LeadTimeStatus;
  /** Load dates in order (day 1 first). Empty for race_only. */
  load_dates: string[];
  /** Full window length for the event. */
  window_days: number;
  warning: string | null;
};

/**
 * Lead-time validation + load window. Load days are the `window` days before
 * the event that fall strictly after the designation day (the designation day
 * itself is already under way). ≤1 day out → race-day fueling only.
 * A truncated load keeps the per-day target; it never compresses the load.
 */
export function planCarbLoad(input: {
  event_type: RaceEventType;
  distance_km?: number | null;
  event_date: string;
  designated_on: string;
}): CarbLoadPlan {
  const window = raceEventSpec(input.event_type, input.distance_km).load_days;
  const lead = daysBetween(input.event_date, input.designated_on);
  if (lead <= 1) {
    return {
      status: "race_only",
      load_dates: [],
      window_days: window,
      warning:
        lead < 0
          ? "This race date is in the past — no carb load applies."
          : "A proper carb load is no longer possible this close to the race. Only race-day fueling applies.",
    };
  }
  const load_dates: string[] = [];
  for (let i = window; i >= 1; i--) {
    const date = addDays(input.event_date, -i);
    if (date > input.designated_on) load_dates.push(date);
  }
  const truncated = load_dates.length < window;
  return {
    status: truncated ? "truncated" : "full",
    load_dates,
    window_days: window,
    warning: truncated
      ? `Carb load shortened to ${load_dates.length} of ${window} days — designate races 3+ days out for the full load.`
      : null,
  };
}

/** Load-day targets: carbs from g/kg × weight; fat drops; protein fixed. */
export function carbLoadTargets(input: {
  event_type: RaceEventType;
  distance_km?: number | null;
  weight_kg: number;
  base: { carbs_g: number; fat_g: number };
  carbs_g_per_kg?: number;
}): {
  carbs_g_per_kg: number;
  target_carbs_g: number;
  target_fat_g: number;
  added_carbs_g: number;
  added_fat_g: number;
  added_kcal: number;
} {
  const perKg =
    input.carbs_g_per_kg ??
    raceEventSpec(input.event_type, input.distance_km).carbs_g_per_kg.default;
  const target_carbs_g = Math.round(perKg * input.weight_kg);
  const target_fat_g = Math.min(input.base.fat_g, LOAD_DAY_FAT_G);
  const added_carbs_g = target_carbs_g - input.base.carbs_g;
  const added_fat_g = target_fat_g - input.base.fat_g;
  return {
    carbs_g_per_kg: perKg,
    target_carbs_g,
    target_fat_g,
    added_carbs_g,
    added_fat_g,
    added_kcal: Math.round(added_carbs_g * 4 + added_fat_g * 9),
  };
}

// ---------------------------------------------------------------------------
// Applying the day's adjustment to base targets
// ---------------------------------------------------------------------------

export type MacroTargets = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

/** What the day's run state added, kept separate from the base target. */
export type RunFuelMeta = {
  kind: RunFuelKind;
  basis: RunFuelBasis;
  base: MacroTargets;
  added_kcal: number;
  added_carbs_g: number;
  added_fat_g: number;
  added_protein_g: number;
  basis_duration_min: number | null;
  load_day_index: number | null;
  load_day_count: number | null;
  carbs_g_per_kg: number | null;
  event_type: RaceEventType | null;
  event_date: string | null;
  /** Race distance — names custom-distance races. */
  event_distance_km: number | null;
  event_name: string | null;
};

/** The race a day's adjustment belongs to. */
export type RaceEventRef = {
  event_type: RaceEventType | null;
  event_date: string | null;
  event_distance_km?: number | null;
  event_name?: string | null;
};

/** Run context for a day — null means Mode 1 (nothing planned or run). */
export type RunDayMeta = {
  fuel: RunFuelMeta | null;
  /** A plan or run existed whose adjustment is now gone (skipped / came up short). */
  adjustment_removed: boolean;
  /** An actual run with no matching plan reconciled the day. */
  unplanned: boolean;
};

export function applyRunFuelAdjustment(
  base: MacroTargets,
  adjustment: Pick<
    RunFuelAdjustment,
    | "kind"
    | "basis"
    | "added_carbs_g"
    | "added_kcal"
    | "added_fat_g"
    | "added_protein_g"
    | "target_carbs_g"
    | "target_fat_g"
    | "basis_duration_min"
    | "load_day_index"
    | "load_day_count"
    | "carbs_g_per_kg"
  >,
  event?: RaceEventRef,
): { targets: MacroTargets; fuel: RunFuelMeta } {
  let targets: MacroTargets;
  if (adjustment.kind === "carb_load" && adjustment.target_carbs_g != null) {
    // Load days hit an absolute carb target — exempt from the cut deficit.
    const carbs = Math.round(adjustment.target_carbs_g);
    const fat = Math.round(adjustment.target_fat_g ?? Math.min(base.fat_g, LOAD_DAY_FAT_G));
    targets = {
      protein_g: base.protein_g,
      carbs_g: carbs,
      fat_g: fat,
      calories: Math.round(
        base.calories + (carbs - base.carbs_g) * 4 + (fat - base.fat_g) * 9,
      ),
    };
  } else {
    const carbs = Math.round(adjustment.added_carbs_g);
    targets = {
      ...base,
      carbs_g: base.carbs_g + carbs,
      calories: Math.round(base.calories + carbs * 4),
    };
  }
  return {
    targets,
    fuel: {
      kind: adjustment.kind,
      basis: adjustment.basis,
      base,
      added_kcal: targets.calories - base.calories,
      added_carbs_g: targets.carbs_g - base.carbs_g,
      added_fat_g: targets.fat_g - base.fat_g,
      added_protein_g: targets.protein_g - base.protein_g,
      basis_duration_min: adjustment.basis_duration_min,
      load_day_index: adjustment.load_day_index,
      load_day_count: adjustment.load_day_count,
      carbs_g_per_kg: adjustment.carbs_g_per_kg,
      event_type: event?.event_type ?? null,
      event_date: event?.event_date ?? null,
      event_distance_km: event?.event_distance_km ?? null,
      event_name: event?.event_name ?? null,
    },
  };
}

/** Layer the day's run state onto computed base goals. */
export function withRunDay(
  goals: ComputedNutritionGoals,
  day: {
    adjustment: RunFuelAdjustment | null;
    event: RaceEventRef | null;
    has_runs: boolean;
    adjustment_removed: boolean;
    unplanned: boolean;
  },
): ComputedNutritionGoals {
  if (!day.adjustment && !day.has_runs) return goals;
  const base: MacroTargets = {
    calories: goals.calories,
    protein_g: goals.protein_g,
    carbs_g: goals.carbs_g,
    fat_g: goals.fat_g,
  };
  let targets = base;
  let fuel: RunFuelMeta | null = null;
  if (day.adjustment) {
    const applied = applyRunFuelAdjustment(base, day.adjustment, day.event ?? undefined);
    targets = applied.targets;
    fuel = applied.fuel;
  }
  const run_day: RunDayMeta = {
    fuel,
    adjustment_removed: !fuel && day.adjustment_removed,
    unplanned: day.unplanned,
  };
  const meta: NutritionGoalMeta = { ...goals.meta, run_day };
  return { ...targets, meta };
}

/** "Carbs 18 g over today's revised target" lines — never hidden in the base. */
export function overageLines(
  totals: { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number },
  targets: MacroTargets,
): string[] {
  const out: string[] = [];
  const check = (label: string, eaten: number | undefined, target: number, unit: string) => {
    const over = Math.round((eaten ?? 0) - target);
    if (over > 0) out.push(`${label} ${over}${unit} over today's revised target`);
  };
  check("Calories", totals.calories, targets.calories, " kcal");
  check("Carbs", totals.carbs_g, targets.carbs_g, " g");
  check("Fat", totals.fat_g, targets.fat_g, " g");
  check("Protein", totals.protein_g, targets.protein_g, " g");
  return out;
}

/** A race's display name: its title when set, else the event label. */
export function raceTitle(
  race: { race_name?: string | null; event_type: RaceEventType | null },
  distance_km?: number | null,
): string {
  const name = race.race_name?.trim();
  if (name) return name;
  return race.event_type ? raceEventLabel(race.event_type, distance_km) : "Race";
}

/** "Half marathon", or "14 mi race" for a custom distance ("Race" without one). */
export function raceEventLabel(type: RaceEventType, distance_km?: number | null): string {
  if (type !== "custom") return RACE_EVENTS[type].label;
  return distance_km ? `${formatDistance(distance_km)} race` : "Race";
}
