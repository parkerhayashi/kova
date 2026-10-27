import {
  getActivityHistory,
  getOuraWorkouts,
  getReadinessHistory,
  getSleepHistory,
  isOuraConnected,
} from "@/lib/data/oura";
import { getAlcoholDrinksByDay } from "@/lib/data/alcohol";
import {
  getSupplementLogs,
  getSupplements,
  getWeightLogs,
} from "@/lib/data/tracking";
import { getLiftingDashboard } from "@/lib/data/workouts";
import { getNutritionByDay } from "@/lib/data/nutrition";
import { buildTrendsPayload } from "@/lib/trends/build";
import type { TrendsInput, TrendsPayload, TrendRange } from "@/lib/trends/types";

export function parseTrendRange(raw: string | undefined): TrendRange {
  const n = Number(raw);
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

export async function getTrendsPayload(range: TrendRange): Promise<TrendsPayload> {
  const [
    sleep,
    readiness,
    activity,
    weight,
    alcoholDrinksByDay,
    supplements,
    supplementLogs,
    workouts,
    liftingDashboard,
    nutritionByDay,
    ouraConnected,
  ] = await Promise.all([
    getSleepHistory(range),
    getReadinessHistory(range),
    getActivityHistory(range),
    getWeightLogs(range),
    getAlcoholDrinksByDay(range),
    getSupplements(true),
    getSupplementLogs(range),
    getOuraWorkouts(range),
    getLiftingDashboard(range),
    getNutritionByDay(range),
    isOuraConnected(),
  ]);

  const { proteinByDay, caloriesByDay } = nutritionByDay;

  const liftingVolumeByDay = new Map(
    liftingDashboard.volume_by_day.map((row) => [row.date, row.volume_lbs]),
  );

  const input: TrendsInput = {
    sleep,
    readiness,
    activity,
    weight,
    alcoholDrinksByDay,
    supplementLogs,
    supplementCount: supplements.length,
    workouts,
    liftingVolumeByDay,
    proteinByDay,
    caloriesByDay,
  };

  return buildTrendsPayload(input, range, ouraConnected);
}
