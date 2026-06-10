import { createServiceClient } from "@/lib/supabase/server";
import {
  getActivityForDate,
  getActivityHistory,
  getTimezone,
  getUserSettings,
} from "@/lib/data/oura";
import { getUserProfile } from "@/lib/data/profile";
import { getLatestWeight } from "@/lib/data/tracking";
import {
  computeNutritionGoals,
  type ComputedNutritionGoals,
  type GoalInputs,
} from "@/lib/nutrition-goals";
import { sumMeals, mergeDailyTotals, type DailyTotals } from "@/lib/nutrition";
import { sumTakenSupplements } from "@/lib/supplement-nutrition";
import {
  getSupplementLogsForDate,
  getSupplementLogsSince,
  getSupplements,
} from "@/lib/data/tracking";
import { addDays, todayInTimezone } from "@/lib/utils";
import type { Activity, Meal } from "@/types";

async function gatherGoalInputs(date: string): Promise<GoalInputs> {
  const [settings, profile, activity] = await Promise.all([
    getUserSettings(),
    getUserProfile(),
    getActivityForDate(date),
  ]);

  return {
    weight_lbs: profile.weight_lbs,
    body_fat_pct: profile.body_fat_pct,
    weight_goal_lbs: settings?.weight_goal_lbs ?? null,
    body_fat_goal_pct: settings?.body_fat_goal_pct ?? null,
    height_m: profile.height_m,
    age: profile.age,
    biological_sex: profile.biological_sex,
    oura_total_calories: activity?.total_calories ?? null,
    oura_active_calories: activity?.active_calories ?? null,
    water_goal_ml: settings?.water_goal_ml ?? null,
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

export async function getDailyTotals(date: string): Promise<DailyTotals> {
  const [meals, supplements, logs] = await Promise.all([
    getMealsForDate(date),
    getSupplements(true),
    getSupplementLogsForDate(date),
  ]);
  const mealTotals = sumMeals(meals);
  const supplementTotals = sumTakenSupplements(supplements, logs);
  return mergeDailyTotals(mealTotals, supplementTotals);
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
  const [meals, activityRows, settings, profile, supplements, supplementLogs] =
    await Promise.all([
    getMealsSince(days),
    getActivityHistory(days),
    getUserSettings(),
    getUserProfile(),
    getSupplements(true),
    getSupplementLogsSince(addDays(todayInTimezone(timezone), -(days - 1))),
  ]);

  const activityByDate = new Map<string, Activity>(
    activityRows.map((a) => [a.date, a]),
  );
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

  const baseInputs: Omit<GoalInputs, "oura_total_calories" | "oura_active_calories"> =
    {
      weight_lbs: profile.weight_lbs,
      body_fat_pct: profile.body_fat_pct,
      weight_goal_lbs: settings?.weight_goal_lbs ?? null,
      body_fat_goal_pct: settings?.body_fat_goal_pct ?? null,
      height_m: profile.height_m,
      age: profile.age,
      biological_sex: profile.biological_sex,
      water_goal_ml: settings?.water_goal_ml ?? null,
    };

  const start = addDays(todayInTimezone(timezone), -(days - 1));
  const out: { date: string; calories: number; goal: number }[] = [];

  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const activity = activityByDate.get(date);
    const goals = computeNutritionGoals({
      ...baseInputs,
      oura_total_calories: activity?.total_calories ?? null,
      oura_active_calories: activity?.active_calories ?? null,
    });
    const dayMeals = mealsByDate.get(date) ?? [];
    const daySupplementLogs = supplementLogsByDate.get(date) ?? [];
    const dayTotals = mergeDailyTotals(
      sumMeals(dayMeals),
      sumTakenSupplements(supplements, daySupplementLogs),
    );
    out.push({
      date,
      calories: Math.round(dayTotals.calories ?? 0),
      goal: goals.calories,
    });
  }

  return out;
}
