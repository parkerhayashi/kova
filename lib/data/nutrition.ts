import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import {
  getTimezone,
  getUserSettings,
} from "@/lib/data/oura";
import { getUserProfile } from "@/lib/data/profile";
import {
  computeAdaptiveEnergySnapshot,
  computeNutritionGoals,
  estimateTdee,
  MANUAL_NUDGE_LIMIT,
  parseActivityLevel,
  parseAdaptiveEnergyState,
  resolveAdaptiveEnergy,
  resolveBmr,
  type AdaptiveEnergyState,
  type ComputedNutritionGoals,
  type GoalInputs,
} from "@/lib/nutrition-goals";
import { bodyFatPctFromSources } from "@/lib/data/body-fat";
import { sumMeals, mergeDailyTotals, type DailyTotals } from "@/lib/nutrition";
import {
  buildReverseDietStart,
  parseReverseDietState,
  reviewReverseDiet,
  reverseDietView,
  reverseTargetCalories,
  type ReverseDietView,
} from "@/lib/reverse-diet";
import {
  buildDietBreakStart,
  dietBreakView,
  parseDietBreakState,
  reviewDietBreak,
  type DietBreakDurationDays,
  type DietBreakView,
} from "@/lib/diet-break";
import { buildWeightMetrics } from "@/lib/cut-coach";
import { sumTakenSupplements } from "@/lib/supplement-nutrition";
import {
  getLatestWeight,
  getSupplementLogsForDate,
  getSupplementLogsSince,
  getSupplements,
  getWeightLogs,
} from "@/lib/data/tracking";
import { addDays, normalizeIsoDate, todayInTimezone } from "@/lib/utils";
import {
  buildNutritionCaloriesVsWeight,
  buildNutritionProteinVsWeight,
  dateRangeFromToday,
} from "@/lib/trends/nutrition-weight";
import type { DualTrendView } from "@/lib/trends/types";
import type { DietBreakState, Meal, ReverseDietState } from "@/types";
import {
  getAlcoholCaloriesByDay,
  getAlcoholCaloriesForDate,
} from "@/lib/alcohol-nutrition";
import {
  getCarbLoadDates,
  getMidRunIntakeByDay,
  getRunFuelAdjustmentsBetween,
  getMidRunIntakesForDate,
  getRunDayState,
  sumIntakes,
  withoutDates,
} from "@/lib/data/running";
import { applyRunFuelAdjustment, withRunDay } from "@/lib/run-fuel";

function asMeal(row: Meal): Meal {
  const date = normalizeIsoDate(row.date) ?? row.date;
  return { ...row, date };
}
async function persistAdaptiveEnergyState(
  state: AdaptiveEnergyState,
): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!row) return;

  await db
    .from("user_settings")
    .update({ adaptive_energy_state: state })
    .eq("id", row.id);
}

async function persistReverseDietState(
  state: ReverseDietState | null,
): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!row) return;
  await db
    .from("user_settings")
    .update({ reverse_diet_state: state })
    .eq("id", row.id);
}

async function persistDietBreakState(
  state: DietBreakState | null,
): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!row) return;
  await db
    .from("user_settings")
    .update({ diet_break_state: state })
    .eq("id", row.id);
}

async function gatherGoalInputs(date: string): Promise<GoalInputs> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const excludeTodayIntake = date === today;

  const [settings, profile, { caloriesByDay: rawCalories }, weightLogs, loadDays] =
    await Promise.all([
      getUserSettings(),
      getUserProfile(),
      getNutritionByDay(14),
      getWeightLogs(30),
      getCarbLoadDates(30),
    ]);
  // Planned carb-load days are exempt from intake-vs-weight drift.
  const caloriesByDay = withoutDates(rawCalories, loadDays);

  const weightEntries = weightLogs.map((row) => ({
    dateKey: row.date,
    weight: row.weight_lbs,
  }));

  const body_fat_pct = bodyFatPctFromSources({
    weightLogPct: profile.body_fat_pct,
    visual: settings?.visual_body_fat_state,
  });
  const activity_level = parseActivityLevel(settings?.activity_level);

  const weight_lbs = profile.weight_lbs ?? 170;
  const weight_kg = weight_lbs / 2.2046226218;
  const height_cm = (profile.height_m ?? 1.75) * 100;
  const age = profile.age ?? 30;
  const { bmr } = resolveBmr({
    weightKg: weight_kg,
    heightCm: height_cm,
    age,
    sex: profile.biological_sex,
    body_fat_pct,
  });
  const formulaTdee = estimateTdee(bmr, activity_level);

  const computed = computeAdaptiveEnergySnapshot({
    caloriesByDay,
    weightEntries,
    endDate: date,
    formulaTdee,
    excludeEndDate: excludeTodayIntake,
  });
  const stored = parseAdaptiveEnergyState(settings?.adaptive_energy_state);
  const { snapshot, state, persist } = resolveAdaptiveEnergy({
    computed,
    stored,
    today,
  });
  if (persist && state) {
    await persistAdaptiveEnergyState(state);
  }

  const maintenance =
    formulaTdee + (snapshot?.adjustment ?? 0);

  let reverseDiet = parseReverseDietState(settings?.reverse_diet_state);
  if (reverseDiet?.active) {
    const weightMetrics = buildWeightMetrics(weightEntries, today);
    const reviewed = reviewReverseDiet({
      state: reverseDiet,
      today,
      rateLbWeek: weightMetrics.weekly_rate_lbs,
      maintenance,
    });
    if (reviewed.changed) {
      reverseDiet = reviewed.state;
      await persistReverseDietState(reverseDiet);
    }
  }

  let dietBreak = parseDietBreakState(settings?.diet_break_state);
  if (dietBreak?.active) {
    const reviewed = reviewDietBreak({ state: dietBreak, today });
    if (reviewed.changed) {
      dietBreak = reviewed.state;
      await persistDietBreakState(dietBreak);
    }
  }

  return {
    weight_lbs: profile.weight_lbs,
    body_fat_pct,
    weight_goal_lbs: settings?.weight_goal_lbs ?? null,
    body_fat_goal_pct: settings?.body_fat_goal_pct ?? null,
    height_m: profile.height_m,
    age: profile.age,
    biological_sex: profile.biological_sex,
    activity_level,
    adaptive: snapshot,
    reverseDiet,
    dietBreak,
  };
}

/**
 * Base targets with no run fuel. Future days use today's base (adaptive state
 * can't be reviewed ahead of time).
 */
export const getBaseNutritionGoals = cache(async function getBaseNutritionGoals(
  date?: string,
): Promise<ComputedNutritionGoals> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const targetDate = date ?? today;
  const inputs = await gatherGoalInputs(targetDate > today ? today : targetDate);
  return computeNutritionGoals(inputs);
});

/** The day's targets: base + any run-fuel / carb-load adjustment. */
export const getNutritionGoals = cache(async function getNutritionGoals(
  date?: string,
): Promise<ComputedNutritionGoals> {
  const timezone = await getTimezone();
  const targetDate = date ?? todayInTimezone(timezone);
  const [base, runDay] = await Promise.all([
    getBaseNutritionGoals(targetDate),
    getRunDayState(targetDate),
  ]);
  return withRunDay(base, runDay);
});

export async function getReverseDietStatus(): Promise<ReverseDietView> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const goals = await getNutritionGoals(today);
  const settings = await getUserSettings();
  const state = parseReverseDietState(settings?.reverse_diet_state);
  const weights = await getWeightLogs(21);
  const metrics = buildWeightMetrics(
    weights.map((w) => ({ dateKey: w.date, weight: w.weight_lbs })),
    today,
  );
  return reverseDietView({
    state,
    today,
    maintenance: goals.meta.maintenance_calories,
    rateLbWeek: metrics.weekly_rate_lbs,
  });
}

export async function getDietBreakStatus(): Promise<DietBreakView> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const goals = await getNutritionGoals(today);
  const settings = await getUserSettings();
  const state = parseDietBreakState(settings?.diet_break_state);
  return dietBreakView({
    state,
    today,
    maintenance: goals.meta.maintenance_calories,
  });
}

/** Begin reverse diet at the current (usually cut) calorie target. */
export async function startReverseDiet(): Promise<ReverseDietState> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const settings = await getUserSettings();
  const existing = parseReverseDietState(settings?.reverse_diet_state);
  if (existing?.active) return existing;

  // Ending an active diet break — reverse and break are mutually exclusive.
  const breakState = parseDietBreakState(settings?.diet_break_state);
  if (breakState?.active) {
    await persistDietBreakState({
      ...breakState,
      active: false,
      completed_at: today,
    });
  }

  // Compute goals without reverse/break so we capture the cut target as baseline.
  const inputs = await gatherGoalInputs(today);
  const baselineInputs: GoalInputs = {
    ...inputs,
    reverseDiet: null,
    dietBreak: null,
  };
  const baseline = computeNutritionGoals(baselineInputs);
  const weight = baseline.meta.current_weight_lbs;
  if (weight == null) throw new Error("Log a weigh-in before starting reverse diet.");

  const state = buildReverseDietStart({
    today,
    start_calories: baseline.calories,
    start_weight_lbs: weight,
  });
  await persistReverseDietState(state);
  return state;
}

export async function stopReverseDiet(): Promise<void> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const settings = await getUserSettings();
  const existing = parseReverseDietState(settings?.reverse_diet_state);
  if (!existing) {
    await persistReverseDietState(null);
    return;
  }
  await persistReverseDietState({
    ...existing,
    active: false,
    completed_at: existing.completed_at ?? today,
    hold_until: null,
  });
}

/** Manual +1 step (skip the weekly gate) — for when you want to bump early. */
export async function bumpReverseDietNow(): Promise<ReverseDietState> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const settings = await getUserSettings();
  const existing = parseReverseDietState(settings?.reverse_diet_state);
  if (!existing?.active) throw new Error("Reverse diet is not active.");

  const goals = await getNutritionGoals(today);
  const next: ReverseDietState = {
    ...existing,
    added_kcal: existing.added_kcal + existing.step_kcal,
    last_review_at: today,
    hold_until: null,
  };
  // Still respect the soft maintenance ceiling.
  const capped = reverseTargetCalories(next);
  if (capped > goals.meta.maintenance_calories + 100) {
    throw new Error("Already at the reverse-diet maintenance ceiling.");
  }
  await persistReverseDietState(next);
  return next;
}

/** Begin a diet break — pin calories at maintenance for a set or open stretch. */
export async function startDietBreak(
  durationDays: DietBreakDurationDays = null,
): Promise<DietBreakState> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const settings = await getUserSettings();
  const existing = parseDietBreakState(settings?.diet_break_state);
  if (existing?.active) return existing;

  // Ending an active reverse — mutually exclusive with diet break.
  const reverse = parseReverseDietState(settings?.reverse_diet_state);
  if (reverse?.active) {
    await persistReverseDietState({
      ...reverse,
      active: false,
      completed_at: today,
      hold_until: null,
    });
  }

  const inputs = await gatherGoalInputs(today);
  const baseline = computeNutritionGoals({
    ...inputs,
    reverseDiet: null,
    dietBreak: null,
  });
  const weight = baseline.meta.current_weight_lbs;
  if (weight == null) throw new Error("Log a weigh-in before starting a diet break.");

  const state = buildDietBreakStart({
    today,
    start_weight_lbs: weight,
    duration_days: durationDays,
  });
  await persistDietBreakState(state);
  return state;
}

export async function stopDietBreak(): Promise<void> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const settings = await getUserSettings();
  const existing = parseDietBreakState(settings?.diet_break_state);
  if (!existing) {
    await persistDietBreakState(null);
    return;
  }
  await persistDietBreakState({
    ...existing,
    active: false,
    completed_at: existing.completed_at ?? today,
  });
}

export async function saveNutritionTargets(input: {
  weight_goal_lbs: number | null;
  body_fat_goal_pct: number | null;
}): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!row) throw new Error("Settings not found");

  await db
    .from("user_settings")
    .update({
      weight_goal_lbs: input.weight_goal_lbs,
      body_fat_goal_pct: input.body_fat_goal_pct,
    })
    .eq("id", row.id);
}

/** Zero the intake/weight TDEE nudge and pause re-review for 14 days. */
export async function resetAdaptiveEnergyState(): Promise<void> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  await persistAdaptiveEnergyState({ adjustment: 0, updated_at: today });
}

/** Leave manual mode: clear stored state so auto review resumes immediately. */
export async function clearAdaptiveEnergyState(): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!row) return;
  await db
    .from("user_settings")
    .update({ adaptive_energy_state: null })
    .eq("id", row.id);
}

/** Pin the TDEE nudge to a hand-set value; auto review holds it until reset. */
export async function setManualAdaptiveEnergyState(
  adjustment: number,
): Promise<number> {
  if (!Number.isFinite(adjustment)) throw new Error("Nudge must be a number");
  const value = Math.round(
    Math.max(-MANUAL_NUDGE_LIMIT, Math.min(MANUAL_NUDGE_LIMIT, adjustment)),
  );
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  await persistAdaptiveEnergyState({
    adjustment: value,
    updated_at: today,
    manual: true,
  });
  return value;
}

export const getMealsForDate = cache(async function getMealsForDate(date: string): Promise<Meal[]> {
  const day = normalizeIsoDate(date) ?? date;
  const db = createServiceClient();
  const { data, error } = await db
    .from("meals")
    .select("*")
    .eq("date", day)
    .order("logged_at", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as Meal[]) ?? []).map(asMeal);
});

export async function getMealsSince(days: number): Promise<Meal[]> {
  const db = createServiceClient();
  const timezone = await getTimezone();
  const since = addDays(todayInTimezone(timezone), -(days - 1));
  const { data, error } = await db
    .from("meals")
    .select("*")
    .gte("date", since)
    .order("date", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data as Meal[]) ?? []).map(asMeal);
}

/** Daily nutrition totals keyed by date (meals + supplements). */
export const getNutritionByDay = cache(async function getNutritionByDay(days: number): Promise<{
  caloriesByDay: Map<string, number>;
  proteinByDay: Map<string, number>;
}> {
  const timezone = await getTimezone();
  const since = addDays(todayInTimezone(timezone), -(days - 1));
  const [meals, supplements, supplementLogs, alcoholByDay, runIntakeByDay] =
    await Promise.all([
      getMealsSince(days),
      getSupplements(true),
      getSupplementLogsSince(since),
      getAlcoholCaloriesByDay(days, timezone),
      getMidRunIntakeByDay(since),
    ]);

  const caloriesByDay = new Map<string, number>();
  const proteinByDay = new Map<string, number>();
  const mealsByDate = new Map<string, Meal[]>();
  for (const meal of meals) {
    const list = mealsByDate.get(meal.date) ?? [];
    list.push(meal);
    mealsByDate.set(meal.date, list);
  }

  const logsByDate = new Map<string, typeof supplementLogs>();
  for (const log of supplementLogs) {
    const list = logsByDate.get(log.date) ?? [];
    list.push(log);
    logsByDate.set(log.date, list);
  }

  for (const [date, dayMeals] of mealsByDate) {
    const mealTotals = sumMeals(dayMeals);
    const supTotals = sumTakenSupplements(
      supplements,
      logsByDate.get(date) ?? [],
    );
    const merged = mergeDailyTotals(mealTotals, supTotals);
    const alcohol = alcoholByDay.get(date) ?? 0;
    const calories = Math.round((merged.calories ?? 0) + alcohol);
    const protein = Math.round(merged.protein_g ?? 0);
    if (calories > 0) caloriesByDay.set(date, calories);
    if (protein > 0) proteinByDay.set(date, protein);
  }

  for (const [date, logs] of logsByDate) {
    if (mealsByDate.has(date)) continue;
    const merged = mergeDailyTotals(
      {},
      sumTakenSupplements(supplements, logs),
    );
    const alcohol = alcoholByDay.get(date) ?? 0;
    const calories = Math.round((merged.calories ?? 0) + alcohol);
    const protein = Math.round(merged.protein_g ?? 0);
    if (calories > 0) caloriesByDay.set(date, calories);
    if (protein > 0) proteinByDay.set(date, protein);
  }

  for (const [date, alcohol] of alcoholByDay) {
    if (caloriesByDay.has(date)) continue;
    if (alcohol > 0) caloriesByDay.set(date, alcohol);
  }

  // Gels and other on-run fuel count as intake.
  for (const [date, intake] of runIntakeByDay) {
    if (intake.kcal <= 0) continue;
    caloriesByDay.set(date, Math.round((caloriesByDay.get(date) ?? 0) + intake.kcal));
  }

  return { caloriesByDay, proteinByDay };
});

/** Daily protein totals keyed by date (meals + supplements). */
export async function getProteinByDay(days: number): Promise<Map<string, number>> {
  const { proteinByDay } = await getNutritionByDay(days);
  return proteinByDay;
}

export const getDailyTotals = cache(async function getDailyTotals(date: string): Promise<DailyTotals> {
  const [meals, supplements, logs, alcoholCalories, runIntakes] = await Promise.all([
    getMealsForDate(date),
    getSupplements(true),
    getSupplementLogsForDate(date),
    getAlcoholCaloriesForDate(date),
    getMidRunIntakesForDate(date),
  ]);
  const mealTotals = sumMeals(meals);
  const supplementTotals = sumTakenSupplements(supplements, logs);
  let totals = mergeDailyTotals(mealTotals, supplementTotals);
  if (alcoholCalories > 0) {
    totals = mergeDailyTotals(totals, { calories: alcoholCalories });
  }
  if (runIntakes.length > 0) {
    const fuel = sumIntakes(runIntakes);
    totals = mergeDailyTotals(totals, { calories: fuel.kcal, carbs_g: fuel.carbs_g });
  }
  return totals;
});

export async function addMeal(
  row: Omit<Meal, "id" | "logged_at">,
): Promise<Meal> {
  const day = normalizeIsoDate(row.date) ?? row.date;
  const db = createServiceClient();
  const { data, error } = await db
    .from("meals")
    .insert({ ...row, date: day })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return asMeal(data as Meal);
}

/** Insert several rows in one statement (one meal's ingredients). */
export async function addMeals(
  rows: Omit<Meal, "id" | "logged_at">[],
): Promise<void> {
  if (rows.length === 0) return;
  const db = createServiceClient();
  const { error } = await db
    .from("meals")
    .insert(rows.map((row) => ({ ...row, date: normalizeIsoDate(row.date) ?? row.date })));
  if (error) throw new Error(error.message);
}

/** Remove every ingredient row of one logged meal. */
export async function deleteMealGroup(groupId: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("meals").delete().eq("meal_group_id", groupId);
  if (error) throw new Error(error.message);
}

export async function deleteMeal(id: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("meals").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Daily calories vs. the day's goal. Goal = today's real base target (same
 * resolved TDEE nudge, diet break / reverse state the page uses) plus that
 * day's stored run fuel or carb load. Past nudges aren't stored, so earlier
 * days share today's base rather than a re-derived estimate.
 */
export async function getCalorieTrend(
  days: number,
): Promise<{ date: string; calories: number; goal: number }[]> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const since = addDays(today, -(days - 1));
  const [meals, supplements, supplementLogs, alcoholByDay, runIntakeByDay, base, adjustments] =
    await Promise.all([
      getMealsSince(days),
      getSupplements(true),
      getSupplementLogsSince(since),
      getAlcoholCaloriesByDay(days, timezone),
      getMidRunIntakeByDay(since),
      getBaseNutritionGoals(today),
      getRunFuelAdjustmentsBetween(since, today),
    ]);

  const mealsByDate = new Map<string, Meal[]>();
  for (const meal of meals) {
    const list = mealsByDate.get(meal.date) ?? [];
    list.push(meal);
    mealsByDate.set(meal.date, list);
  }

  const supplementLogsByDate = new Map<string, typeof supplementLogs>();
  for (const log of supplementLogs) {
    const list = supplementLogsByDate.get(log.date) ?? [];
    list.push(log);
    supplementLogsByDate.set(log.date, list);
  }

  const baseTargets = {
    calories: base.calories,
    protein_g: base.protein_g,
    carbs_g: base.carbs_g,
    fat_g: base.fat_g,
  };

  const out: { date: string; calories: number; goal: number }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(since, i);
    const dayTotals = mergeDailyTotals(
      sumMeals(mealsByDate.get(date) ?? []),
      sumTakenSupplements(supplements, supplementLogsByDate.get(date) ?? []),
    );
    const calories = Math.round(
      (dayTotals.calories ?? 0) +
        (alcoholByDay.get(date) ?? 0) +
        (runIntakeByDay.get(date)?.kcal ?? 0),
    );
    const adjustment = adjustments.get(date);
    const goal = adjustment
      ? applyRunFuelAdjustment(baseTargets, adjustment).targets.calories
      : baseTargets.calories;
    out.push({ date, calories, goal });
  }
  return out;
}

/** Dual-axis charts relating logged nutrition to body weight. */
export async function getNutritionWeightTrends(
  days: number,
): Promise<DualTrendView[]> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const rangeDates = dateRangeFromToday(today, days);

  const [{ caloriesByDay, proteinByDay }, weight] = await Promise.all([
    getNutritionByDay(days),
    getWeightLogs(days),
  ]);

  return [
    buildNutritionCaloriesVsWeight(caloriesByDay, weight, rangeDates),
    buildNutritionProteinVsWeight(proteinByDay, weight, rangeDates),
  ];
}
