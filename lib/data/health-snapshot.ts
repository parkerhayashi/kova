import { getGarminDailyHistory, getGarminStatus } from "@/lib/data/garmin";
import { getActivityHistory, getSleepHistory, getTimezone } from "@/lib/data/oura";
import { getDailyTotals, getNutritionGoals } from "@/lib/data/nutrition";
import { getRunningSnapshot, type RunningSnapshot } from "@/lib/data/running";
import { getTodayWorkoutSummary } from "@/lib/data/workouts";
import { maybeSyncHevyOnOpen } from "@/lib/data/hevy";
import { getTrendsPayload } from "@/lib/data/trends";
import { maintenanceSourceLabel } from "@/lib/nutrition-goals";
import type { RunFuelMeta } from "@/lib/run-fuel";
import { describeCorrelation } from "@/lib/trends/correlation";
import { unstable_noStore } from "next/cache";
import { latestRowWith, todayInTimezone } from "@/lib/utils";
import type { WorkoutTodaySummary } from "@/types";

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
  /** Sleep, Body Battery, HRV, steps — Garmin (Oura history before the switch). */
  wellness: {
    garminConfigured: boolean;
    lastSyncedAt: string | null;
    sleepScore: number | null;
    sleepAsOf: string | null;
    sleepSeconds: number | null;
    bodyBattery: number | null;
    bodyBatteryMorning: number | null;
    bodyBatteryAsOf: string | null;
    hrvMs: number | null;
    hrvStatus: string | null;
    restingHr: number | null;
    steps: number | null;
    stepGoal: number | null;
    stepsAsOf: string | null;
    /** Moderate + 2 × vigorous, Garmin's intensity-minute convention. */
    intensityMin: number | null;
    stressHighMin: number | null;
  };
  nutrition: {
    calories: number | null;
    protein_g: number | null;
    carbs_g: number | null;
    fat_g: number | null;
    goalCalories: number;
    goalProtein_g: number;
    goalCarbs_g: number;
    goalFat_g: number;
    burnLabel: string;
    /** Today's run fuel / carb load (null on base-target days). */
    runFuel: RunFuelMeta | null;
  };
  running: RunningSnapshot;
  workout: WorkoutTodaySummary;
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
    activityRows,
    garminRows,
    garmin,
    mealTotals,
    nutritionGoals,
    running,
  ] = await Promise.all([
    getSleepHistory(30),
    getActivityHistory(30),
    getGarminDailyHistory(14),
    getGarminStatus(),
    getDailyTotals(todayIso),
    getNutritionGoals(todayIso),
    getRunningSnapshot(todayIso),
  ]);

  const sleep = valueForTodayOrLatest(sleepRows, todayIso, "score");
  const sleepSeconds = valueForTodayOrLatest(sleepRows, todayIso, "total_sleep_duration");
  const battery = valueForTodayOrLatest(garminRows, todayIso, "body_battery_latest");
  const batteryMorning = valueForDate(garminRows, battery.asOf ?? todayIso, "body_battery_max");
  const hrv = valueForTodayOrLatest(garminRows, todayIso, "hrv_last_night_ms");
  const today = garminRows.find((r) => r.date === todayIso) ?? null;
  // The workout insight uses this morning's Body Battery (Kova's recovery signal).
  const workout = await getTodayWorkoutSummary(
    today?.body_battery_max != null ? Math.round(today.body_battery_max) : null,
  );

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });

  const steps = valueForTodayOrLatest(activityRows, todayIso, "steps");
  const stress = valueForTodayOrLatest(activityRows, todayIso, "stress_score");
  const stepsDay = garminRows.find((r) => r.date === steps.asOf) ?? null;
  const hrvDay = garminRows.find((r) => r.date === hrv.asOf) ?? null;

  return {
    todayLabel,
    todayIso,
    timezone,
    wellness: {
      garminConfigured: garmin.configured,
      lastSyncedAt: garmin.last_synced_at,
      sleepScore: sleep.value != null ? Number(sleep.value) : null,
      sleepAsOf: sleep.asOf,
      sleepSeconds: sleepSeconds.value != null ? Number(sleepSeconds.value) : null,
      bodyBattery: battery.value != null ? Math.round(battery.value) : null,
      bodyBatteryMorning: batteryMorning != null ? Math.round(batteryMorning) : null,
      bodyBatteryAsOf: battery.asOf,
      hrvMs: hrv.value != null ? Math.round(hrv.value) : null,
      hrvStatus: hrvDay?.hrv_status ?? null,
      restingHr: (today ?? hrvDay)?.resting_hr ?? null,
      steps: steps.value,
      stepGoal: stepsDay?.step_goal ?? null,
      stepsAsOf: steps.asOf,
      intensityMin:
        stepsDay && (stepsDay.intensity_moderate_min != null || stepsDay.intensity_vigorous_min != null)
          ? (stepsDay.intensity_moderate_min ?? 0) + 2 * (stepsDay.intensity_vigorous_min ?? 0)
          : null,
      stressHighMin: stress.value,
    },
    nutrition: {
      calories: mealTotals.calories ?? null,
      protein_g: mealTotals.protein_g ?? null,
      carbs_g: mealTotals.carbs_g ?? null,
      fat_g: mealTotals.fat_g ?? null,
      goalCalories: nutritionGoals.calories,
      goalProtein_g: nutritionGoals.protein_g,
      goalCarbs_g: nutritionGoals.carbs_g,
      goalFat_g: nutritionGoals.fat_g,
      burnLabel: maintenanceSourceLabel(nutritionGoals.meta.maintenance_source).toLowerCase(),
      runFuel: nutritionGoals.meta.run_day?.fuel ?? null,
    },
    running,
    workout,
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
