import {
  getActivityHistory,
  getOuraLastSyncedAt,
  getReadinessHistory,
  getSleepHistory,
  getTimezone,
  isOuraConnected,
} from "@/lib/data/oura";
import { getDailyTotals, getNutritionGoals } from "@/lib/data/nutrition";
import { getRunningSnapshot, type RunningSnapshot } from "@/lib/data/running";
import { getTodayWorkoutSummary } from "@/lib/data/workouts";
import { maybeSyncHevyOnOpen } from "@/lib/data/hevy";
import {
  getLatestWeight,
  getSupplementLogs,
  getSupplements,
} from "@/lib/data/tracking";
import { getTrendsPayload } from "@/lib/data/trends";
import { maintenanceSourceLabel } from "@/lib/nutrition-goals";
import type { RunFuelMeta } from "@/lib/run-fuel";
import { describeCorrelation } from "@/lib/trends/correlation";
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
    readinessAsOf: string | null;
    sleepAsOf: string | null;
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
    goalCarbs_g: number;
    burnLabel: string;
    /** Today's run fuel / carb load (null on base-target days). */
    runFuel: RunFuelMeta | null;
  };
  running: RunningSnapshot;
  workout: WorkoutTodaySummary;
  weight: WeightLog | null;
  supplements: { done: number; total: number };
};

export async function getHealthSnapshot(): Promise<HealthSnapshotData> {
  unstable_noStore();
  void maybeSyncHevyOnOpen();

  const timezone = await getTimezone();
  const todayIso = todayInTimezone(timezone);
  // One round of reads — everything here only needs today's date. (The Coach
  // section shares these via request-scoped cache.)
  const [
    sleepRows,
    readinessRows,
    activityRows,
    connected,
    ouraLastSyncedAt,
    supplements,
    supplementLogs,
    weight,
    mealTotals,
    nutritionGoals,
    running,
  ] = await Promise.all([
    getSleepHistory(400),
    getReadinessHistory(400),
    getActivityHistory(400),
    isOuraConnected(),
    getOuraLastSyncedAt(),
    getSupplements(true),
    getSupplementLogs(1, timezone),
    getLatestWeight(),
    getDailyTotals(todayIso),
    getNutritionGoals(todayIso),
    getRunningSnapshot(todayIso),
  ]);

  const readiness = valueForTodayOrLatest(readinessRows, todayIso, "score");
  const sleep = valueForTodayOrLatest(sleepRows, todayIso, "score");
  const readinessScore =
    readiness.value != null ? Number(readiness.value) : null;
  // Only the workout insight depends on today's readiness.
  const workout = await getTodayWorkoutSummary(readinessScore);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });

  const supplementsTaken = supplementLogs.filter(
    (l) => l.date === todayIso && l.taken,
  ).length;

  const hasOuraData =
    sleepRows.length > 0 || readinessRows.length > 0 || activityRows.length > 0;

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
      readinessScore: readiness.value != null ? Number(readiness.value) : null,
      sleepScore: sleep.value != null ? Number(sleep.value) : null,
      readinessAsOf: readiness.asOf,
      sleepAsOf: sleep.asOf,
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
      goalCarbs_g: nutritionGoals.carbs_g,
      burnLabel: maintenanceSourceLabel(nutritionGoals.meta.maintenance_source).toLowerCase(),
      runFuel: nutritionGoals.meta.run_day?.fuel ?? null,
    },
    running,
    workout,
    weight,
    supplements: { done: supplementsTaken, total: supplements.length },
  };
}

/** Top 30-day correlations for Home — streamed separately (it's the heaviest read). */
export async function getHomeTrends(): Promise<SnapshotTrend[]> {
  unstable_noStore();
  const payload = await getTrendsPayload(30);
  return [...payload.correlations]
    .filter((c) => c.r !== null && c.points.length >= c.minPairs)
    .sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0))
    .slice(0, 3)
    .map((c) => ({
      id: c.id,
      title: c.title,
      r: c.r as number,
      strength: describeCorrelation(c.r),
    }));
}
