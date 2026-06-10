import {
  getActivityHistory,
  getOuraLastSyncedAt,
  getReadinessHistory,
  getSleepHistory,
  getTimezone,
  isOuraConnected,
} from "@/lib/data/oura";
import { getDailyTotals, getNutritionGoals } from "@/lib/data/nutrition";
import { getTodayWorkoutSummary } from "@/lib/data/workouts";
import { getWaterState } from "@/lib/data/water";
import {
  getHabitLogs,
  getHabits,
  getLatestWeight,
  getSupplementLogs,
  getSupplements,
} from "@/lib/data/tracking";
import { getTrendsPayload } from "@/lib/data/trends";
import { burnSourceLabel } from "@/lib/nutrition-goals";
import { describeCorrelation } from "@/lib/trends/correlation";
import { computeTargetMl, normalizeWater, unitVolMl } from "@/lib/water";
import { latestNonNull, todayInTimezone } from "@/lib/utils";
import type { WeightLog, WorkoutTodaySummary } from "@/types";

export type SnapshotTrend = {
  id: string;
  title: string;
  r: number;
  strength: string;
};

export type HealthSnapshotData = {
  todayLabel: string;
  timezone: string;
  oura: {
    connected: boolean;
    hasData: boolean;
    lastSyncedAt: string | null;
    readinessScore: number | null;
    sleepScore: number | null;
    activityScore: number | null;
    stress: number | null;
    steps: number | null;
  };
  nutrition: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    goalCalories: number;
    goalProtein_g: number;
    burnLabel: string;
  };
  water: { ml: number; goalMl: number };
  workout: WorkoutTodaySummary;
  weight: WeightLog | null;
  habits: { done: number; total: number };
  supplements: { done: number; total: number };
  trends: SnapshotTrend[];
};

export async function getHealthSnapshot(): Promise<HealthSnapshotData> {
  const [
    sleepRows,
    readinessRows,
    activityRows,
    connected,
    timezone,
    ouraLastSyncedAt,
    habits,
    habitLogs,
    supplements,
    supplementLogs,
    weight,
    trendsPayload,
  ] = await Promise.all([
    getSleepHistory(400),
    getReadinessHistory(400),
    getActivityHistory(400),
    isOuraConnected(),
    getTimezone(),
    getOuraLastSyncedAt(),
    getHabits(true),
    getHabitLogs(1),
    getSupplements(true),
    getSupplementLogs(1),
    getLatestWeight(),
    getTrendsPayload(30),
  ]);

  const todayIso = todayInTimezone(timezone);
  const [mealTotals, nutritionGoals, waterState, workout] = await Promise.all([
    getDailyTotals(todayIso),
    getNutritionGoals(todayIso),
    getWaterState(),
    getTodayWorkoutSummary(),
  ]);

  const water = normalizeWater(waterState);
  const waterUnits = water.logs[todayIso] ?? 0;
  const waterMl = Math.round(waterUnits * unitVolMl(water));
  const waterGoalMl = Math.round(computeTargetMl(water).total);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });

  const habitsDone = habitLogs.filter(
    (l) => l.date === todayIso && l.completed,
  ).length;
  const supplementsTaken = supplementLogs.filter(
    (l) => l.date === todayIso && l.taken,
  ).length;

  const hasOuraData =
    sleepRows.length > 0 || readinessRows.length > 0 || activityRows.length > 0;

  const rankedTrends = [...trendsPayload.correlations]
    .filter((c) => c.r !== null && c.points.length >= c.minPairs)
    .sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0))
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      title: c.title,
      r: c.r as number,
      strength: describeCorrelation(c.r),
    }));

  return {
    todayLabel,
    timezone,
    oura: {
      connected,
      hasData: hasOuraData,
      lastSyncedAt: ouraLastSyncedAt,
      readinessScore: latestNonNull(readinessRows, "score"),
      sleepScore: latestNonNull(sleepRows, "score"),
      activityScore: latestNonNull(activityRows, "activity_score"),
      stress: latestNonNull(activityRows, "stress_score"),
      steps: latestNonNull(activityRows, "steps"),
    },
    nutrition: {
      calories: mealTotals.calories ?? null,
      protein_g: mealTotals.protein_g ?? null,
      carbs_g: mealTotals.carbs_g ?? null,
      fat_g: mealTotals.fat_g ?? null,
      goalCalories: nutritionGoals.calories,
      goalProtein_g: nutritionGoals.protein_g,
      burnLabel: burnSourceLabel(nutritionGoals.meta.burn_source).toLowerCase(),
    },
    water: { ml: waterMl, goalMl: waterGoalMl },
    workout,
    weight,
    habits: { done: habitsDone, total: habits.length },
    supplements: { done: supplementsTaken, total: supplements.length },
    trends: rankedTrends,
  };
}
