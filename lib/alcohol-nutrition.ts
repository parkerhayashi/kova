import {
  getHabits,
  getHabitLogs,
  getHabitLogsForDate,
} from "@/lib/data/tracking";
import {
  drinkTierCalories,
  isDrinkQuantityHabit,
  normalizeDrinkTier,
} from "@/lib/habit-drinks";
import type { DrinkTier } from "@/types";

function alcoholHabitIds(habits: Awaited<ReturnType<typeof getHabits>>): Set<string> {
  return new Set(
    habits.filter(isDrinkQuantityHabit).map((habit) => habit.id),
  );
}

function sumAlcoholCalories(
  habits: Awaited<ReturnType<typeof getHabits>>,
  logs: { habit_id: string; completed: boolean; amount_tier: string | null }[],
): number {
  const ids = alcoholHabitIds(habits);
  if (ids.size === 0) return 0;

  let total = 0;
  for (const log of logs) {
    if (!ids.has(log.habit_id) || !log.completed) continue;
    total += drinkTierCalories(log.amount_tier);
  }
  return total;
}

/** Estimated alcohol calories keyed by date from habit tag logs. */
export async function getAlcoholCaloriesByDay(
  days: number,
  timezone?: string,
): Promise<Map<string, number>> {
  const [habits, logs] = await Promise.all([
    getHabits(true),
    getHabitLogs(days, timezone),
  ]);
  const ids = alcoholHabitIds(habits);
  if (ids.size === 0) return new Map();

  const map = new Map<string, number>();
  for (const log of logs) {
    if (!ids.has(log.habit_id) || !log.completed) continue;
    const calories = drinkTierCalories(log.amount_tier);
    if (calories <= 0) continue;
    map.set(log.date, (map.get(log.date) ?? 0) + calories);
  }
  return map;
}

export async function getAlcoholCaloriesForDate(date: string): Promise<number> {
  const [habits, logs] = await Promise.all([
    getHabits(true),
    getHabitLogsForDate(date),
  ]);
  return sumAlcoholCalories(habits, logs);
}

/** Alcohol day-tag habit + tier for a date (shared by Habits + Nutrition UI). */
export async function getAlcoholLogForDate(date: string): Promise<{
  habitId: string | null;
  tier: DrinkTier | null;
  calories: number;
}> {
  const [habits, logs] = await Promise.all([
    getHabits(true),
    getHabitLogsForDate(date),
  ]);
  const alcoholHabit = habits.find(isDrinkQuantityHabit) ?? null;
  if (!alcoholHabit) {
    return { habitId: null, tier: null, calories: 0 };
  }

  const log = logs.find((row) => row.habit_id === alcoholHabit.id) ?? null;
  const tier =
    log?.completed ? normalizeDrinkTier(log.amount_tier) : null;

  return {
    habitId: alcoholHabit.id,
    tier,
    calories: drinkTierCalories(tier),
  };
}
