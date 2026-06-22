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
import { maybeSyncHevyOnOpen } from "@/lib/data/hevy";
import { getWaterState } from "@/lib/data/water";
import {
  getHabitLogs,
  getHabits,
  getLatestWeight,
  getSupplementLogs,
  getSupplements,
} from "@/lib/data/tracking";
import { getTrendsPayload } from "@/lib/data/trends";
import { maintenanceSourceLabel } from "@/lib/nutrition-goals";
import { describeCorrelation } from "@/lib/trends/correlation";
import { computeTargetMl, normalizeWater, unitVolMl } from "@/lib/water";
import { unstable_noStore } from "next/cache";
import { latestRowWith, todayInTimezone } from "@/lib/utils";
import type { WeightLog, WorkoutTodaySummary } from "@/types";

function valueForDate<T extends { date: string }, K extends keyof T>(
  rows: T[],
  date: string,
  key: K,
): T[K] | null {
  const row = rows.find((r) => r.date === date);
  if (!row) return null;
  const value = row[key];
  return value ?? null;
}

/** Prefer today's value; fall back to the latest non-null reading (Oura activity page pattern). */
function valueForTodayOrLatest<T extends { date: string }, K extends keyof T>(
  rows: T[],
  todayIso: string,
  key: K,
): { value: T[K] | null; asOf: string | null } {
  const todayVal = valueForDate(rows, todayIso, key);
  if (todayVal !== null && todayVal !== undefined) {
    return { value: todayVal, asOf: todayIso };
  }
  const row = latestRowWith(rows, key);
  if (!row) return { value: null, asOf: null };
  const value = row[key];
  return {
    value: value ?? null,
    asOf: value != null ? row.date : null,
  };
}

export type SnapshotTrend = {
  id: string;
  title: string;
  r: number;
  strength: string;
};

export type HealthSnapshotData = {
  todayLabel: string;
  todayIso: string;
  timezone: string;
  oura: {
    connected: boolean;
    hasData: boolean;
    lastSyncedAt: string | null;
    readinessScore: number | null;
    sleepScore: number | null;
    activityScore: number | null;
    activityAsOf: string | null;
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
  habits: {
    positiveDone: number;
    positiveTotal: number;
    tagsLogged: number;
    tagTotal: number;
  };
  supplements: { done: number; total: number };
  trends: SnapshotTrend[];
};

export async function getHealthSnapshot(): Promise<HealthSnapshotData> {
  unstable_noStore();
  void maybeSyncHevyOnOpen();

  const timezone = await getTimezone();
  const [
    sleepRows,
    readinessRows,
    activityRows,
    connected,
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
    getOuraLastSyncedAt(),
    getHabits(true),
    getHabitLogs(1, timezone),
    getSupplements(true),
    getSupplementLogs(1, timezone),
    getLatestWeight(),
    getTrendsPayload(30),
  ]);

  const todayIso = todayInTimezone(timezone);
  const readinessScore = valueForDate(readinessRows, todayIso, "score");

  const [mealTotals, nutritionGoals, waterState, workout] = await Promise.all([
    getDailyTotals(todayIso),
    getNutritionGoals(todayIso),
    getWaterState(),
    getTodayWorkoutSummary(readinessScore),
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

  const positiveHabits = habits.filter((h) => (h.kind ?? "positive") === "positive");
  const trackHabits = habits.filter((h) => h.kind === "track");
  const completedToday = new Set(
    habitLogs
      .filter((l) => l.date === todayIso && l.completed)
      .map((l) => l.habit_id),
  );
  const positiveDone = positiveHabits.filter((h) => completedToday.has(h.id)).length;
  const tagsLogged = trackHabits.filter((h) => completedToday.has(h.id)).length;
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

  const activityScore = valueForTodayOrLatest(
    activityRows,
    todayIso,
    "activity_score",
  );
  const steps = valueForTodayOrLatest(activityRows, todayIso, "steps");
  const stress = valueForTodayOrLatest(activityRows, todayIso, "stress_score");

  return {
    todayLabel,
    todayIso,
    timezone,
    oura: {
      connected,
      hasData: hasOuraData,
      lastSyncedAt: ouraLastSyncedAt,
      readinessScore: valueForDate(readinessRows, todayIso, "score"),
      sleepScore: valueForDate(sleepRows, todayIso, "score"),
      activityScore: activityScore.value,
      activityAsOf: activityScore.asOf,
      stress: stress.value,
      steps: steps.value,
    },
    nutrition: {
      calories: mealTotals.calories ?? null,
      protein_g: mealTotals.protein_g ?? null,
      carbs_g: mealTotals.carbs_g ?? null,
      fat_g: mealTotals.fat_g ?? null,
      goalCalories: nutritionGoals.calories,
      goalProtein_g: nutritionGoals.protein_g,
      burnLabel: maintenanceSourceLabel(nutritionGoals.meta.maintenance_source).toLowerCase(),
    },
    water: { ml: waterMl, goalMl: waterGoalMl },
    workout,
    weight,
    habits: {
      positiveDone,
      positiveTotal: positiveHabits.length,
      tagsLogged,
      tagTotal: trackHabits.length,
    },
    supplements: { done: supplementsTaken, total: supplements.length },
    trends: rankedTrends,
  };
}
