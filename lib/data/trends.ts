import {
  getActivityHistory,
  getOuraWorkouts,
  getSleepHistory,
  getTimezone,
} from "@/lib/data/oura";
import { getAlcoholDrinksByDay } from "@/lib/data/alcohol";
import { getGarminDailyHistory } from "@/lib/data/garmin";
import { isGarminConfigured } from "@/lib/garmin";
import {
  getSupplementLogs,
  getSupplements,
  getWeightLogs,
} from "@/lib/data/tracking";
import { getLiftingDashboard } from "@/lib/data/workouts";
import { getNutritionByDay } from "@/lib/data/nutrition";
import { getRecentActualRuns } from "@/lib/data/running";
import { todayInTimezone } from "@/lib/utils";
import { buildTrendsPayload } from "@/lib/trends/build";
import type { TrendsInput, TrendsPayload, TrendRange } from "@/lib/trends/types";
import type { Readiness } from "@/types";

export function parseTrendRange(raw: string | undefined): TrendRange {
  const n = Number(raw);
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

export async function getTrendsPayload(range: TrendRange): Promise<TrendsPayload> {
  const [
    sleep,
    garminDaily,
    activity,
    weight,
    alcoholDrinksByDay,
    supplements,
    supplementLogs,
    workouts,
    liftingDashboard,
    nutritionByDay,
    wearableConnected,
    runs,
    timezone,
  ] = await Promise.all([
    getSleepHistory(range),
    getGarminDailyHistory(range),
    getActivityHistory(range),
    getWeightLogs(range),
    getAlcoholDrinksByDay(range),
    getSupplements(true),
    getSupplementLogs(range),
    getOuraWorkouts(range),
    getLiftingDashboard(range),
    getNutritionByDay(range),
    Promise.resolve(isGarminConfigured()),
    // Running is additive — Trends still renders if the runs table is unavailable.
    getRecentActualRuns(range).catch(() => []),
    getTimezone(),
  ]);

  const { proteinByDay, caloriesByDay } = nutritionByDay;

  // Garmin replaced Oura: correlations that used readiness / HRV balance now
  // use morning Body Battery and overnight HRV (ms). Oura days drop out rather
  // than mixing two different scales.
  const recovery: Readiness[] = garminDaily.map((g) => ({
    id: g.date,
    date: g.date,
    score: g.body_battery_max,
    hrv_balance: g.hrv_last_night_ms,
    resting_heart_rate: g.resting_hr,
    body_temperature: null,
    recovery_index: null,
    cardiovascular_age: null,
    resilience_score: null,
    temperature_trend_deviation: null,
    contributors: null,
    resilience_contributors: null,
    created_at: g.updated_at,
  }));

  const liftingVolumeByDay = new Map(
    liftingDashboard.volume_by_day.map((row) => [row.date, row.volume_lbs]),
  );

  const input: TrendsInput = {
    sleep,
    readiness: recovery,
    activity,
    weight,
    alcoholDrinksByDay,
    supplementLogs,
    supplementCount: supplements.length,
    workouts,
    liftingVolumeByDay,
    proteinByDay,
    caloriesByDay,
    runs,
    today: todayInTimezone(timezone),
  };

  return buildTrendsPayload(input, range, wearableConnected);
}
