import { rollingAverageWeight, type WeightEntry } from "@/lib/coach-composition";
import { DEFAULT_GOALS, type NutritionGoals } from "@/lib/nutrition";
import { addDays } from "@/lib/utils";

const LB_PER_KG = 2.204_622_621_8;
const KCAL_PER_LB = 3500;
const ADAPTIVE_WINDOW_DAYS = 14;
const MIN_LOGGED_DAYS = 10;
const MIN_DAILY_CALORIES = 400;
const TDEE_ACTIVITY_MULTIPLIER = 1.55;
const MAX_ADAPTIVE_DELTA = 250;
/** Minimum days between applied TDEE nudge changes. */
export const ADAPTIVE_COOLDOWN_DAYS = 14;
/** Max kcal the nudge can move per review (after cooldown). */
export const ADAPTIVE_MAX_STEP = 100;
/** Ignore tiny implied adjustments — below this is weigh-in noise, not signal. */
export const ADAPTIVE_DEADBAND_KCAL = 50;

export type AdaptiveEnergyState = {
  adjustment: number;
  updated_at: string;
};

export type MaintenanceSource = "tdee" | "tdee_adjusted";

export type AdaptiveEnergySnapshot = {
  windowDays: number;
  loggedDays: number;
  avgDailyIntake: number;
  weightChangeLbs: number;
  impliedMaintenance: number;
  adjustment: number;
};

export type NutritionGoalMeta = {
  current_weight_lbs: number | null;
  current_body_fat_pct: number | null;
  weight_goal_lbs: number | null;
  body_fat_goal_pct: number | null;
  bmr: number;
  tdee_calories: number;
  maintenance_calories: number;
  maintenance_source: MaintenanceSource;
  /** Small nudge applied on top of TDEE from intake/weight trend. */
  adaptive_adjustment: number;
  adaptive_reason: string | null;
  calorie_adjustment: number;
  adjustment_reason: string | null;
};

export type ComputedNutritionGoals = NutritionGoals & { meta: NutritionGoalMeta };

export type GoalInputs = {
  weight_lbs: number | null;
  body_fat_pct: number | null;
  weight_goal_lbs: number | null;
  body_fat_goal_pct: number | null;
  height_m: number | null;
  age: number | null;
  biological_sex: string | null;
  adaptive?: AdaptiveEnergySnapshot | null;
  water_goal_ml: number | null;
};

export function lbsToKg(lbs: number): number {
  return lbs / LB_PER_KG;
}

export function kgToLbs(kg: number): number {
  return kg * LB_PER_KG;
}

function defaultBodyFatPct(sex: string | null): number {
  const s = sex?.toLowerCase() ?? "";
  if (s.includes("female") || s === "f") return 25;
  if (s.includes("male") || s === "m") return 18;
  return 20;
}

/** Mifflin–St Jeor basal metabolic rate (kcal/day). */
export function mifflinStJeorBmr(params: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: string | null;
}): number {
  const base =
    10 * params.weightKg + 6.25 * params.heightCm - 5 * params.age;
  const s = params.sex?.toLowerCase() ?? "";
  if (s.includes("female") || s === "f") return base - 161;
  return base + 5;
}

/** TDEE from Mifflin–St Jeor BMR × activity factor (fixed moderate default). */
export function estimateTdee(bmr: number): number {
  return Math.round(bmr * TDEE_ACTIVITY_MULTIPLIER);
}

export function averageDailyIntake(
  caloriesByDay: Map<string, number>,
  endDate: string,
  windowDays = ADAPTIVE_WINDOW_DAYS,
  options?: { excludeEndDate?: boolean },
): { avg: number; loggedDays: number } | null {
  const lastDay = options?.excludeEndDate ? addDays(endDate, -1) : endDate;
  const values: number[] = [];
  for (let i = 0; i < windowDays; i++) {
    const date = addDays(lastDay, -(windowDays - 1 - i));
    const calories = caloriesByDay.get(date);
    if (calories != null && calories >= MIN_DAILY_CALORIES) {
      values.push(calories);
    }
  }
  if (values.length < MIN_LOGGED_DAYS) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { avg, loggedDays: values.length };
}

export function weightChangeOverWindow(
  entries: WeightEntry[],
  endDate: string,
  windowDays = ADAPTIVE_WINDOW_DAYS,
): number | null {
  const endAvg = rollingAverageWeight(entries, endDate, 7);
  const startAvg = rollingAverageWeight(
    entries,
    addDays(endDate, -windowDays),
    7,
  );
  if (endAvg == null || startAvg == null) return null;
  return endAvg - startAvg;
}

export function computeAdaptiveEnergySnapshot(input: {
  caloriesByDay: Map<string, number>;
  weightEntries: WeightEntry[];
  endDate: string;
  formulaTdee: number;
  windowDays?: number;
  excludeEndDate?: boolean;
}): AdaptiveEnergySnapshot | null {
  const windowDays = input.windowDays ?? ADAPTIVE_WINDOW_DAYS;
  const intake = averageDailyIntake(
    input.caloriesByDay,
    input.endDate,
    windowDays,
    { excludeEndDate: input.excludeEndDate },
  );
  const weightChangeLbs = weightChangeOverWindow(
    input.weightEntries,
    input.endDate,
    windowDays,
  );
  if (!intake || weightChangeLbs == null) return null;

  const impliedMaintenance = Math.round(
    intake.avg -
      (weightChangeLbs * KCAL_PER_LB) / windowDays,
  );
  const rawAdjustment = impliedMaintenance - input.formulaTdee;
  const clamped = Math.round(
    Math.max(-MAX_ADAPTIVE_DELTA, Math.min(MAX_ADAPTIVE_DELTA, rawAdjustment)),
  );
  // Sub-deadband deltas are noise from water weight, not a real TDEE miss.
  const adjustment =
    Math.abs(clamped) < ADAPTIVE_DEADBAND_KCAL ? 0 : clamped;

  return {
    windowDays,
    loggedDays: intake.loggedDays,
    avgDailyIntake: Math.round(intake.avg),
    weightChangeLbs: Math.round(weightChangeLbs * 10) / 10,
    impliedMaintenance,
    adjustment,
  };
}

function daysBetween(startDate: string, endDate: string): number {
  const [y1, m1, d1] = startDate.split("-").map(Number);
  const [y2, m2, d2] = endDate.split("-").map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((t2 - t1) / 86400000);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Hold or gradually apply TDEE nudges — at most once per cooldown window. */
export function resolveAdaptiveEnergy(input: {
  computed: AdaptiveEnergySnapshot | null;
  stored: AdaptiveEnergyState | null;
  today: string;
  cooldownDays?: number;
  maxStep?: number;
}): {
  snapshot: AdaptiveEnergySnapshot | null;
  state: AdaptiveEnergyState | null;
  persist: boolean;
} {
  const cooldownDays = input.cooldownDays ?? ADAPTIVE_COOLDOWN_DAYS;
  const maxStep = input.maxStep ?? ADAPTIVE_MAX_STEP;
  const { computed, stored, today } = input;

  if (!computed) {
    if (!stored) return { snapshot: null, state: null, persist: false };
    // Drop leftover noise nudges even when we can't recompute yet.
    if (Math.abs(stored.adjustment) < ADAPTIVE_DEADBAND_KCAL) {
      if (stored.adjustment === 0) {
        return {
          snapshot: {
            windowDays: ADAPTIVE_WINDOW_DAYS,
            loggedDays: 0,
            avgDailyIntake: 0,
            weightChangeLbs: 0,
            impliedMaintenance: 0,
            adjustment: 0,
          },
          state: stored,
          persist: false,
        };
      }
      const cleared: AdaptiveEnergyState = {
        adjustment: 0,
        updated_at: today,
      };
      return {
        snapshot: {
          windowDays: ADAPTIVE_WINDOW_DAYS,
          loggedDays: 0,
          avgDailyIntake: 0,
          weightChangeLbs: 0,
          impliedMaintenance: 0,
          adjustment: 0,
        },
        state: cleared,
        persist: true,
      };
    }
    return {
      snapshot: {
        windowDays: ADAPTIVE_WINDOW_DAYS,
        loggedDays: 0,
        avgDailyIntake: 0,
        weightChangeLbs: 0,
        impliedMaintenance: 0,
        adjustment: stored.adjustment,
      },
      state: stored,
      persist: false,
    };
  }

  // Clear tiny stored nudges immediately (e.g. leftover −17 kcal noise).
  if (
    stored != null &&
    Math.abs(stored.adjustment) < ADAPTIVE_DEADBAND_KCAL &&
    stored.adjustment !== 0
  ) {
    const cleared: AdaptiveEnergyState = {
      adjustment: 0,
      updated_at: today,
    };
    return {
      snapshot: { ...computed, adjustment: 0 },
      state: cleared,
      persist: true,
    };
  }

  const withinCooldown =
    stored != null &&
    daysBetween(stored.updated_at, today) < cooldownDays;

  if (withinCooldown && stored) {
    // If the latest estimate is within the deadband, let the nudge decay to 0
    // even mid-cooldown so phantom adjustments don't stick for two weeks.
    if (computed.adjustment === 0 && stored.adjustment !== 0) {
      const cleared: AdaptiveEnergyState = {
        adjustment: 0,
        updated_at: today,
      };
      return {
        snapshot: { ...computed, adjustment: 0 },
        state: cleared,
        persist: true,
      };
    }
    return {
      snapshot: { ...computed, adjustment: stored.adjustment },
      state: stored,
      persist: false,
    };
  }

  const target = computed.adjustment;
  const nextAdjustment = stored
    ? Math.round(
        clamp(
          stored.adjustment + clamp(target - stored.adjustment, -maxStep, maxStep),
          -MAX_ADAPTIVE_DELTA,
          MAX_ADAPTIVE_DELTA,
        ),
      )
    : Math.round(clamp(target, -maxStep, maxStep));

  const state: AdaptiveEnergyState = {
    adjustment: nextAdjustment,
    updated_at: today,
  };

  return {
    snapshot: { ...computed, adjustment: nextAdjustment },
    state,
    persist: !stored || nextAdjustment !== stored.adjustment || stored.updated_at !== today,
  };
}

export function parseAdaptiveEnergyState(
  raw: unknown,
): AdaptiveEnergyState | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.adjustment !== "number" || typeof row.updated_at !== "string") {
    return null;
  }
  return { adjustment: row.adjustment, updated_at: row.updated_at };
}

export function estimateMaintenanceCalories(input: {
  bmr: number;
  adaptive?: AdaptiveEnergySnapshot | null;
}): {
  tdee: number;
  maintenance: number;
  source: MaintenanceSource;
  adaptiveAdjustment: number;
} {
  const tdee = estimateTdee(input.bmr);
  const adaptiveAdjustment = input.adaptive?.adjustment ?? 0;
  if (input.adaptive && adaptiveAdjustment !== 0) {
    return {
      tdee,
      maintenance: Math.max(1200, tdee + adaptiveAdjustment),
      source: "tdee_adjusted",
      adaptiveAdjustment,
    };
  }
  return {
    tdee,
    maintenance: tdee,
    source: "tdee",
    adaptiveAdjustment: 0,
  };
}

export function calorieAdjustment(input: {
  current_weight_lbs: number;
  weight_goal_lbs: number | null;
  current_body_fat_pct: number;
  body_fat_goal_pct: number | null;
}): { adjustment: number; reason: string | null } {
  let adjustment = 0;
  const reasons: string[] = [];

  if (input.weight_goal_lbs != null) {
    const delta = input.current_weight_lbs - input.weight_goal_lbs;
    if (delta > 1) {
      adjustment -= 500;
      reasons.push(`−500 toward ${input.weight_goal_lbs} lb`);
    } else if (delta < -1) {
      adjustment += 300;
      reasons.push(`+300 toward ${input.weight_goal_lbs} lb`);
    }
  }

  if (
    input.body_fat_goal_pct != null &&
    input.current_body_fat_pct > input.body_fat_goal_pct + 0.5 &&
    adjustment >= 0
  ) {
    adjustment -= 400;
    reasons.push(`−400 toward ${input.body_fat_goal_pct}% body fat`);
  }

  return {
    adjustment,
    reason: reasons.length > 0 ? reasons.join(" · ") : null,
  };
}

function adaptiveReason(snapshot: AdaptiveEnergySnapshot): string {
  const weight =
    snapshot.weightChangeLbs === 0
      ? "weight stable"
      : snapshot.weightChangeLbs > 0
        ? `+${snapshot.weightChangeLbs} lb`
        : `${snapshot.weightChangeLbs} lb`;
  return `${snapshot.loggedDays}d intake vs ${weight} over ${snapshot.windowDays}d`;
}

/** Derive daily macro targets from body composition, TDEE, and goals. */
export function computeNutritionGoals(input: GoalInputs): ComputedNutritionGoals {
  const weight_lbs = input.weight_lbs ?? 170;
  const weight_kg = lbsToKg(weight_lbs);
  const body_fat =
    input.body_fat_pct ?? defaultBodyFatPct(input.biological_sex);
  const lean_kg = weight_kg * (1 - body_fat / 100);

  // ~1 g protein per lb of lean mass (common recomp target).
  const protein_g = Math.round(Math.max(lean_kg * 2.2, 80) / 5) * 5;

  const height_cm = (input.height_m ?? 1.75) * 100;
  const age = input.age ?? 30;
  const bmr = Math.round(
    mifflinStJeorBmr({
      weightKg: weight_kg,
      heightCm: height_cm,
      age,
      sex: input.biological_sex,
    }),
  );

  const { tdee, maintenance, source, adaptiveAdjustment } =
    estimateMaintenanceCalories({
      bmr,
      adaptive: input.adaptive,
    });

  const { adjustment, reason } = calorieAdjustment({
    current_weight_lbs: weight_lbs,
    weight_goal_lbs: input.weight_goal_lbs,
    current_body_fat_pct: body_fat,
    body_fat_goal_pct: input.body_fat_goal_pct,
  });

  const calories = Math.max(1200, Math.round(maintenance + adjustment));

  const protein_cal = protein_g * 4;
  const remaining = Math.max(0, calories - protein_cal);
  const fat_g = Math.round((remaining * 0.3) / 9);
  const carbs_g = Math.round((remaining * 0.7) / 4);

  return {
    calories,
    protein_g,
    carbs_g,
    fat_g,
    water_ml: input.water_goal_ml ?? DEFAULT_GOALS.water_ml,
    meta: {
      current_weight_lbs: input.weight_lbs,
      current_body_fat_pct: input.body_fat_pct,
      weight_goal_lbs: input.weight_goal_lbs,
      body_fat_goal_pct: input.body_fat_goal_pct,
      bmr,
      tdee_calories: tdee,
      maintenance_calories: maintenance,
      maintenance_source: source,
      adaptive_adjustment: adaptiveAdjustment,
      adaptive_reason:
        input.adaptive && adaptiveAdjustment !== 0
          ? adaptiveReason(input.adaptive)
          : null,
      calorie_adjustment: adjustment,
      adjustment_reason: reason,
    },
  };
}

export function maintenanceSourceLabel(source: MaintenanceSource): string {
  switch (source) {
    case "tdee":
      return "TDEE estimate";
    case "tdee_adjusted":
      return "TDEE + intake/weight nudge";
  }
}
