import { drinkCalories } from "@/lib/alcohol-drinks";
import {
  getAlcoholDrinksByDay,
  getAlcoholDrinksForDate,
} from "@/lib/data/alcohol";

/** Estimated alcohol calories keyed by date. */
export async function getAlcoholCaloriesByDay(
  days: number,
  timezone?: string,
): Promise<Map<string, number>> {
  const drinksByDay = await getAlcoholDrinksByDay(days, timezone);
  const map = new Map<string, number>();
  for (const [date, drinks] of drinksByDay) {
    const calories = drinkCalories(drinks);
    if (calories > 0) map.set(date, calories);
  }
  return map;
}

export async function getAlcoholCaloriesForDate(date: string): Promise<number> {
  return drinkCalories(await getAlcoholDrinksForDate(date));
}

/** Drink count + estimated calories for a date (Nutrition UI, Muse API). */
export async function getAlcoholLogForDate(date: string): Promise<{
  drinks: number | null;
  calories: number;
}> {
  const drinks = await getAlcoholDrinksForDate(date);
  return { drinks, calories: drinkCalories(drinks) };
}
