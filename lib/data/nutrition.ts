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
import { buildWeightMetrics } from "@/lib/cut-coach";
import { sumTakenSupplements } from "@/lib/supplement-nutrition";
import {
  getLatestWeight,
  getSupplementLogsForDate,
  getSupplementLogsSince,
  getSupplements,
  getWeightLogs,
} from "@/lib/data/tracking";
import { addDays, todayInTimezone } from "@/lib/utils";
import {
  buildNutritionCaloriesVsWeight,
  buildNutritionProteinVsWeight,
  dateRangeFromToday,
} from "@/lib/trends/nutrition-weight";
import type { DualTrendView } from "@/lib/trends/types";
import type { Meal, ReverseDietState } from "@/types";
import {
  getAlcoholCaloriesByDay,
  getAlcoholCaloriesForDate,
} from "@/lib/alcohol-nutrition";

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

async function gatherGoalInputs(date: string): Promise<GoalInputs> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const excludeTodayIntake = date === today;

  const [settings, profile, { caloriesByDay }, weightLogs] = await Promise.all([
    getUserSettings(),
    getUserProfile(),
    getNutritionByDay(14),
    getWeightLogs(30),
  ]);

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
    water_goal_ml: settings?.water_goal_ml ?? null,
    reverseDiet,
  };
}

export async function getNutritionGoals(
  date?: string,
): Promise<ComputedNutritionGoals> {
  const timezone = await getTimezone();
  const targetDate = date ?? todayInTimezone(timezone);
  const inputs = await gatherGoalInputs(targetDate);
  return computeNutritionGoals(inputs);
}

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

/** Begin reverse diet at the current (usually cut) calorie target. */
export async function startReverseDiet(): Promise<ReverseDietState> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const settings = await getUserSettings();
  const existing = parseReverseDietState(settings?.reverse_diet_state);
  if (existing?.active) return existing;

  // Compute goals without reverse so we capture the cut target as the baseline.
  const inputs = await gatherGoalInputs(today);
  const baselineInputs: GoalInputs = { ...inputs, reverseDiet: null };
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

export async function getMealsForDate(date: string): Promise<Meal[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("meals")
    .select("*")
    .eq("date", date)
    .order("logged_at", { ascending: true });
  return (data as Meal[]) ?? [];
}

export async function getMealsSince(days: number): Promise<Meal[]> {
  const db = createServiceClient();
  const timezone = await getTimezone();
  const since = addDays(todayInTimezone(timezone), -(days - 1));
  const { data } = await db
    .from("meals")
    .select("*")
    .gte("date", since)
    .order("date", { ascending: true });
  return (data as Meal[]) ?? [];
}

/** Daily nutrition totals keyed by date (meals + supplements). */
export async function getNutritionByDay(days: number): Promise<{
  caloriesByDay: Map<string, number>;
  proteinByDay: Map<string, number>;
}> {
  const timezone = await getTimezone();
  const since = addDays(todayInTimezone(timezone), -(days - 1));
  const [meals, supplements, supplementLogs, alcoholByDay] = await Promise.all([
    getMealsSince(days),
    getSupplements(true),
    getSupplementLogsSince(since),
    getAlcoholCaloriesByDay(days, timezone),
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

  return { caloriesByDay, proteinByDay };
}

/** Daily protein totals keyed by date (meals + supplements). */
export async function getProteinByDay(days: number): Promise<Map<string, number>> {
  const { proteinByDay } = await getNutritionByDay(days);
  return proteinByDay;
}

export async function getDailyTotals(date: string): Promise<DailyTotals> {
  const [meals, supplements, logs, alcoholCalories] = await Promise.all([
    getMealsForDate(date),
    getSupplements(true),
    getSupplementLogsForDate(date),
    getAlcoholCaloriesForDate(date),
  ]);
  const mealTotals = sumMeals(meals);
  const supplementTotals = sumTakenSupplements(supplements, logs);
  const base = mergeDailyTotals(mealTotals, supplementTotals);
  if (alcoholCalories <= 0) return base;
  return mergeDailyTotals(base, { calories: alcoholCalories });
}

export async function addMeal(
  row: Omit<Meal, "id" | "logged_at">,
): Promise<Meal> {
  const db = createServiceClient();
  const { data, error } = await db.from("meals").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data as Meal;
}

export async function deleteMeal(id: string): Promise<void> {
  const db = createServiceClient();
  await db.from("meals").delete().eq("id", id);
}

export async function getCalorieTrend(
  days: number,
): Promise<{ date: string; calories: number; goal: number }[]> {
  const timezone = await getTimezone();
  const [meals, settings, profile, supplements, supplementLogs, alcoholByDay, weightLogs] =
    await Promise.all([
      getMealsSince(days),
      getUserSettings(),
      getUserProfile(),
      getSupplements(true),
      getSupplementLogsSince(addDays(todayInTimezone(timezone), -(days - 1))),
      getAlcoholCaloriesByDay(days, timezone),
      getWeightLogs(Math.max(days, 21)),
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

  const weightEntries = weightLogs.map((row) => ({
    dateKey: row.date,
    weight: row.weight_lbs,
  }));

  const body_fat_pct = bodyFatPctFromSources({
    weightLogPct: profile.body_fat_pct,
    visual: settings?.visual_body_fat_state,
  });
  const activity_level = parseActivityLevel(settings?.activity_level);

  const baseInputs: Omit<GoalInputs, "adaptive"> = {
    weight_lbs: profile.weight_lbs,
    body_fat_pct,
    weight_goal_lbs: settings?.weight_goal_lbs ?? null,
    body_fat_goal_pct: settings?.body_fat_goal_pct ?? null,
    height_m: profile.height_m,
    age: profile.age,
    biological_sex: profile.biological_sex,
    activity_level,
    water_goal_ml: settings?.water_goal_ml ?? null,
  };

  const start = addDays(todayInTimezone(timezone), -(days - 1));
  const today = todayInTimezone(timezone);
  const out: { date: string; calories: number; goal: number }[] = [];
  const rollingCalories = new Map<string, number>();

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const dayMeals = mealsByDate.get(date) ?? [];
    const daySupplementLogs = supplementLogsByDate.get(date) ?? [];
    const dayTotals = mergeDailyTotals(
      sumMeals(dayMeals),
      sumTakenSupplements(supplements, daySupplementLogs),
    );
    const dayCalories = Math.round(
      (dayTotals.calories ?? 0) + (alcoholByDay.get(date) ?? 0),
    );
    if (dayCalories > 0) rollingCalories.set(date, dayCalories);

    const weight_lbs = baseInputs.weight_lbs ?? 170;
    const weight_kg = weight_lbs / 2.2046226218;
    const height_cm = (baseInputs.height_m ?? 1.75) * 100;
    const age = baseInputs.age ?? 30;
    const { bmr } = resolveBmr({
      weightKg: weight_kg,
      heightCm: height_cm,
      age,
      sex: baseInputs.biological_sex,
      body_fat_pct: baseInputs.body_fat_pct,
    });
    const formulaTdee = estimateTdee(bmr, activity_level);
    const goals = computeNutritionGoals({
      ...baseInputs,
      adaptive: computeAdaptiveEnergySnapshot({
        caloriesByDay: rollingCalories,
        weightEntries,
        endDate: date,
        formulaTdee,
        excludeEndDate: date === today,
      }),
    });
    out.push({
      date,
      calories: dayCalories,
      goal: goals.calories,
    });
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
