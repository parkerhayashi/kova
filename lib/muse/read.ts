import { getCutCoachDaily } from "@/lib/data/cut-coach";
import { getInjuries } from "@/lib/data/injuries";
import { getPerformance } from "@/lib/data/performance";
import { injuryName } from "@/lib/injuries";
import {
  getGarminActivitiesBetween,
  getGarminDailyFor,
  getGarminDailyHistory,
  getGarminStatus,
  matchStrengthSessions,
} from "@/lib/data/garmin";
import {
  getActivityHistory,
  getHeartRateDay,
  getLatestActivity,
  getLatestReadiness,
  getLatestSleep,
  getOuraLastSyncedAt,
  getOuraProfile,
  getOuraSessions,
  getOuraTags,
  getOuraWorkouts,
  getReadinessHistory,
  getSleepHistory,
  getSleepPeriodHistory,
  getTimezone,
  isOuraConnected,
} from "@/lib/data/oura";
import {
  getCalorieTrend,
  getDailyTotals,
  getDietBreakStatus,
  getMealsForDate,
  getMealsSince,
  getNutritionByDay,
  getNutritionGoals,
  getReverseDietStatus,
} from "@/lib/data/nutrition";
import {
  getAlcoholCaloriesByDay,
  getAlcoholLogForDate,
} from "@/lib/alcohol-nutrition";
import { getSavedMeals } from "@/lib/data/saved-meals";
import {
  getLatestWeight,
  getSupplementLogs,
  getSupplementLogsForDate,
  getSupplements,
  getWeightLogs,
} from "@/lib/data/tracking";
import { getBodyFatEstimate } from "@/lib/data/body-fat";
import { getUserProfile } from "@/lib/data/profile";
import {
  getHevyLastSyncedAt,
  isHevyConnected,
  listHevyWorkouts,
} from "@/lib/data/hevy";
import {
  getLiftingCompositionSnapshot,
  getLiftingDashboard,
  getTodayWorkoutSummary,
} from "@/lib/data/workouts";
import { getTrendsPayload, parseTrendRange } from "@/lib/data/trends";
import {
  getFinanceOverview,
  getFinancialTransactionsSince,
  isPlaidConnected,
} from "@/lib/data/finance";
import { isMfaEnabled } from "@/lib/data/auth";
import { computeWeightInsights } from "@/lib/weight-stats";
import { addDays, todayInTimezone } from "@/lib/utils";
import { mapToRecord } from "@/lib/muse/auth";
import type { OuraSession, SleepPeriod } from "@/types";

function remainingMacros(
  goals: { calories: number; protein_g: number; carbs_g: number; fat_g: number },
  totals: {
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
  },
) {
  return {
    calories: Math.round(goals.calories - (totals.calories ?? 0)),
    protein_g: Math.round(goals.protein_g - (totals.protein_g ?? 0)),
    carbs_g: Math.round(goals.carbs_g - (totals.carbs_g ?? 0)),
    fat_g: Math.round(goals.fat_g - (totals.fat_g ?? 0)),
  };
}

function stripSleepPeriodSamples(period: SleepPeriod): SleepPeriod {
  return {
    ...period,
    sleep_phase_5min: null,
    movement_30sec: null,
    heart_rate: null,
    hrv: null,
  };
}

function stripSessionSamples(session: OuraSession): OuraSession {
  return {
    ...session,
    heart_rate: null,
    heart_rate_variability: null,
    motion_count: null,
  };
}

function safeOuraProfile() {
  return getOuraProfile().then((profile) => {
    if (!profile) return null;
    const { email: _email, ...rest } = profile;
    return rest;
  });
}

export async function readMuseToday() {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);

  const [
    sleep,
    readiness,
    activity,
    ouraConnected,
    ouraLastSynced,
    meals,
    totals,
    goals,
    alcohol,
    reverse,
    dietBreak,
    coach,
    latestWeight,
    supplements,
    supplementLogs,
    workout,
    hevyConnected,
    hevyLastSynced,
    plaidConnected,
  ] = await Promise.all([
    getLatestSleep(),
    getLatestReadiness(),
    getLatestActivity(),
    isOuraConnected(),
    getOuraLastSyncedAt(),
    getMealsForDate(today),
    getDailyTotals(today),
    getNutritionGoals(today),
    getAlcoholLogForDate(today),
    getReverseDietStatus(),
    getDietBreakStatus(),
    getCutCoachDaily(),
    getLatestWeight(),
    getSupplements(true),
    getSupplementLogsForDate(today),
    getTodayWorkoutSummary(),
    isHevyConnected(),
    getHevyLastSyncedAt(),
    isPlaidConnected(),
  ]);

  return {
    today,
    timezone,
    connections: {
      oura: ouraConnected,
      oura_last_synced_at: ouraLastSynced,
      hevy: hevyConnected,
      hevy_last_synced_at: hevyLastSynced,
      plaid: plaidConnected,
    },
    // Garmin replaced Oura (Nov 2026): sleep / activity rows now come from Garmin
    // (`source`); readiness is Oura history only — use garmin (Body Battery, HRV).
    oura: { sleep, readiness, activity },
    // Kova's Recovery / Strain / fitness model and active injuries (shape the day's training).
    performance: await (async () => {
      const p = await getPerformance(90);
      return {
        recovery: p.recovery,
        strain: p.strain,
        advice: p.advice,
        fitness: p.current,
        predictions: p.predictions.predictions,
      };
    })(),
    injuries: (await getInjuries(false)).map((v) => ({
      id: v.injury.id,
      name: injuryName(v.injury),
      type: v.injury.injury_type,
      severity: v.severity,
      since: v.injury.onset_date,
      status: v.injury.status,
      checked_in_today: v.checkedInToday,
    })),
    garmin: await (async () => {
      const [status, day] = await Promise.all([getGarminStatus(), getGarminDailyFor(today)]);
      return {
        connected: status.configured,
        last_synced_at: status.last_synced_at,
        today: day ? { ...day, body_battery_curve: undefined } : null,
      };
    })(),
    nutrition: {
      goals,
      totals,
      remaining: remainingMacros(goals, totals),
      meals,
      alcohol,
      reverse,
      diet_break: dietBreak,
    },
    body: {
      latest_weight: latestWeight,
    },
    supplements: {
      catalog: supplements,
      taken_today: supplementLogs,
    },
    training: {
      today: workout,
    },
    coach,
  };
}

export async function readMuseOura(days: number, includeSamples: boolean) {
  const sampleDays = includeSamples ? Math.min(days, 14) : 0;
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);

  const [
    connected,
    lastSynced,
    profile,
    sleep,
    readiness,
    activity,
    workouts,
    sessions,
    tags,
    periods,
    heartRate,
  ] = await Promise.all([
    isOuraConnected(),
    getOuraLastSyncedAt(),
    safeOuraProfile(),
    getSleepHistory(days),
    getReadinessHistory(days),
    getActivityHistory(days),
    getOuraWorkouts(days),
    getOuraSessions(days),
    getOuraTags(days),
    includeSamples
      ? getSleepPeriodHistory(sampleDays)
      : getSleepPeriodHistory(Math.min(days, 30)).then((rows) =>
          rows.map(stripSleepPeriodSamples),
        ),
    includeSamples ? getHeartRateDay(today) : Promise.resolve(null),
  ]);

  return {
    today,
    timezone,
    days,
    connected,
    last_synced_at: lastSynced,
    profile,
    sleep,
    readiness,
    activity,
    workouts,
    sessions: includeSamples ? sessions : sessions.map(stripSessionSamples),
    tags,
    sleep_periods: periods,
    heart_rate_today: heartRate,
    // Garmin daily stats (Body Battery, HRV vs baseline, stress, intensity minutes, step goal).
    garmin_daily: await getGarminDailyHistory(days),
  };
}

export async function readMuseNutrition(days: number, date?: string) {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const focus = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;

  const [
    meals,
    byDay,
    goals,
    totals,
    reverse,
    dietBreak,
    savedMeals,
    supplements,
    supplementLogs,
    alcoholByDay,
    alcoholToday,
    calorieTrend,
  ] = await Promise.all([
    getMealsSince(days),
    getNutritionByDay(days),
    getNutritionGoals(focus),
    getDailyTotals(focus),
    getReverseDietStatus(),
    getDietBreakStatus(),
    getSavedMeals(),
    getSupplements(true),
    getSupplementLogs(days),
    getAlcoholCaloriesByDay(days, timezone),
    getAlcoholLogForDate(focus),
    days <= 14 ? getCalorieTrend(days) : Promise.resolve(null),
  ]);

  return {
    today,
    timezone,
    days,
    focus_date: focus,
    goals,
    totals,
    remaining: remainingMacros(goals, totals),
    calories_by_day: mapToRecord(byDay.caloriesByDay),
    protein_by_day: mapToRecord(byDay.proteinByDay),
    calorie_trend: calorieTrend,
    meals,
    reverse,
    diet_break: dietBreak,
    alcohol: {
      focus: alcoholToday,
      calories_by_day: mapToRecord(alcoholByDay),
    },
    supplements: {
      catalog: supplements,
      logs: supplementLogs,
    },
    saved_meals: savedMeals,
  };
}

export async function readMuseBody(days: number) {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const [logs, latest, estimate, profile, goals] = await Promise.all([
    getWeightLogs(days),
    getLatestWeight(),
    getBodyFatEstimate(),
    getUserProfile(),
    getNutritionGoals(today),
  ]);

  return {
    today,
    timezone,
    days,
    profile: {
      age: profile.age,
      height_m: profile.height_m,
      biological_sex: profile.biological_sex,
      activity_level: profile.activity_level,
      weight_lbs: profile.weight_lbs,
      body_fat_pct: profile.body_fat_pct,
    },
    latest,
    logs,
    insights: computeWeightInsights(logs, today, goals.meta.weight_goal_lbs),
    body_fat: estimate,
  };
}

export async function readMuseTraining(days: number, hevyLimit: number) {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const [summary, dashboard, composition, hevy, hevyConnected, hevyLastSynced, garmin] =
    await Promise.all([
      getTodayWorkoutSummary(),
      getLiftingDashboard(days),
      getLiftingCompositionSnapshot(days),
      listHevyWorkouts(hevyLimit),
      isHevyConnected(),
      getHevyLastSyncedAt(),
      getGarminActivitiesBetween(addDays(today, -(days - 1)), today),
    ]);
  const strength = garmin.filter((a) => a.sport === "strength");
  const paired = matchStrengthSessions(hevy, strength);

  return {
    today,
    timezone,
    days,
    connected: hevyConnected,
    last_synced_at: hevyLastSynced,
    today_summary: summary,
    dashboard,
    composition,
    // Garmin heart rate / training load recorded alongside a Hevy workout.
    hevy_workouts: hevy.map((w) => ({ ...w, garmin: paired[w.id] ?? null })),
    garmin_rides: garmin.filter((a) => a.sport === "cycling"),
    garmin_strength_unpaired: strength.filter(
      (s) => !Object.values(paired).some((p) => p.id === s.id),
    ),
  };
}

export async function readMuseTrends(rangeRaw: string | undefined) {
  const range = parseTrendRange(rangeRaw);
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const trends = await getTrendsPayload(range);

  return {
    today,
    timezone,
    range,
    trends,
  };
}

export async function readMuseLife(days: number) {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const since = addDays(today, -(days - 1));

  const [
    profile,
    mfa,
    oura,
    hevy,
    plaid,
    finance,
    transactions,
    ouraLast,
    hevyLast,
    ouraProfile,
  ] = await Promise.all([
    getUserProfile(),
    isMfaEnabled(),
    isOuraConnected(),
    isHevyConnected(),
    isPlaidConnected(),
    getFinanceOverview(),
    getFinancialTransactionsSince(since, 250),
    getOuraLastSyncedAt(),
    getHevyLastSyncedAt(),
    safeOuraProfile(),
  ]);

  return {
    today,
    timezone,
    days,
    profile: {
      age: profile.age,
      height_m: profile.height_m,
      biological_sex: profile.biological_sex,
      activity_level: profile.activity_level,
      weight_lbs: profile.weight_lbs,
      body_fat_pct: profile.body_fat_pct,
      sources: profile.sources,
    },
    oura_ring: ouraProfile,
    security: {
      password_gate: Boolean(process.env.KOVA_PASSWORD),
      mfa_enabled: mfa,
    },
    connections: {
      oura,
      oura_last_synced_at: ouraLast,
      hevy,
      hevy_last_synced_at: hevyLast,
      plaid,
    },
    finance: {
      ...finance,
      transactions,
    },
  };
}
