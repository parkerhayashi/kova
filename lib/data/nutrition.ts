import { createServiceClient } from "@/lib/supabase/server";
import { getTimezone, getUserSettings } from "@/lib/data/oura";
import { DEFAULT_GOALS, sumMeals, type DailyTotals, type NutritionGoals } from "@/lib/nutrition";
import { addDays, todayInTimezone } from "@/lib/utils";
import type { Meal } from "@/types";

export async function getNutritionGoals(): Promise<NutritionGoals> {
  const settings = await getUserSettings();
  return {
    calories: settings?.calorie_goal ?? DEFAULT_GOALS.calories,
    protein_g: settings?.protein_goal_g ?? DEFAULT_GOALS.protein_g,
    carbs_g: settings?.carbs_goal_g ?? DEFAULT_GOALS.carbs_g,
    fat_g: settings?.fat_goal_g ?? DEFAULT_GOALS.fat_g,
    water_ml: settings?.water_goal_ml ?? DEFAULT_GOALS.water_ml,
  };
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
  const meals = await getMealsForDate(date);
  return sumMeals(meals);
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
): Promise<{ date: string; calories: number }[]> {
  const meals = await getMealsSince(days);
  const timezone = await getTimezone();
  const byDate = new Map<string, Meal[]>();
  for (const meal of meals) {
    const list = byDate.get(meal.date) ?? [];
    list.push(meal);
    byDate.set(meal.date, list);
  }

  const start = addDays(todayInTimezone(timezone), -(days - 1));
  const out: { date: string; calories: number }[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const dayMeals = byDate.get(date) ?? [];
    out.push({
      date,
      calories: Math.round(sumMeals(dayMeals).calories ?? 0),
    });
  }
  return out;
}
