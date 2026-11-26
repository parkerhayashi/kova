import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getGarminActivitiesBetween, getGarminDailyHistory, matchStrengthSessions } from "@/lib/data/garmin";
import { listHevyWorkoutsBetween } from "@/lib/data/hevy";
import { getNutritionByDay, getNutritionGoals } from "@/lib/data/nutrition";
import { getActivityHistory, getSleepHistory } from "@/lib/data/oura";
import { getPerformance } from "@/lib/data/performance";
import { getActivePlan } from "@/lib/data/plan";
import { getMidRunIntakeByDay, getRunFuelCarbsPerHour } from "@/lib/data/running";
import { getLatestWeight } from "@/lib/data/tracking";
import { nutritionInsights, weeklyReport, type Insight, type Series, type WeeklyReport } from "@/lib/insights";
import { mondayOf } from "@/lib/plan-engine";
import { addDays, normalizeIsoDate } from "@/lib/utils";
import type { ActualRun } from "@/types";

const WINDOW = 90;
const LB_PER_KG = 2.204_62;
const day = (v: string) => normalizeIsoDate(v) ?? v;

export type InsightsData = {
  today: string;
  report: WeeklyReport;
  /** Last week's report too, when viewing the current week (it's the finished one). */
  previous: WeeklyReport | null;
  insights: Insight[];
};

/** Weekly report (for `week`, default this week) + nutrition ↔ performance insights. */
export const getInsights = cache(async function getInsights(week?: string): Promise<InsightsData> {
  const perf = await getPerformance(WINDOW);
  const today = perf.today;
  const since = addDays(today, -(WINDOW - 1));
  const db = createServiceClient();
  const [garmin, sleep, activity, nutrition, goals, runRes, rides, lifts, intakes, carbsPerHour, weight, plan] = await Promise.all([
    getGarminDailyHistory(WINDOW),
    getSleepHistory(WINDOW),
    getActivityHistory(WINDOW),
    getNutritionByDay(WINDOW),
    getNutritionGoals(today),
    db
      .from("actual_runs")
      .select("date, actual_duration_min, actual_distance_km, avg_hr, calories, run_type, metrics")
      .gte("date", since)
      .lte("date", today)
      .order("date"),
    getGarminActivitiesBetween(since, today),
    listHevyWorkoutsBetween(since, today),
    getMidRunIntakeByDay(since),
    getRunFuelCarbsPerHour(),
    getLatestWeight(),
    getActivePlan(),
  ]);

  const series = <T>(rows: T[], key: (r: T) => string, value: (r: T) => number | null | undefined): Series => {
    const m: Series = new Map();
    for (const r of rows) {
      const v = value(r);
      if (v != null && Number.isFinite(v)) m.set(day(key(r)), v);
    }
    return m;
  };
  type RunRow = Pick<ActualRun, "date" | "actual_duration_min" | "actual_distance_km" | "avg_hr" | "calories" | "run_type" | "metrics">;
  const runs = ((runRes.data as RunRow[]) ?? []).map((r) => ({ ...r, date: day(r.date) }));

  // Exercise calories: runs + Garmin rides / strength + Hevy lifts the watch missed (~5 kcal/min).
  const exerciseByDay: Series = new Map();
  const addEx = (d: string, kcal: number) => exerciseByDay.set(d, (exerciseByDay.get(d) ?? 0) + kcal);
  for (const r of runs) addEx(r.date, r.calories ?? r.actual_duration_min * 10);
  for (const a of rides) addEx(a.date, a.calories ?? a.duration_min * (a.sport === "cycling" ? 8 : 5));
  const matched = matchStrengthSessions(lifts, rides.filter((a) => a.sport === "strength"));
  for (const w of lifts) if (w.date && !matched[w.id]) addEx(w.date, ((w.duration ?? 0) / 60) * 5);

  const burnByDay = series(activity, (a) => a.date, (a) => a.total_calories);
  const recoveryByDay = series(perf.daily, (d) => d.date, (d) => d.recovery);
  const hrvByDay = series(garmin, (g) => g.date, (g) => g.hrv_last_night_ms);
  const rhrByDay = series(garmin, (g) => g.date, (g) => g.resting_hr);

  // A cut = eating well under what Garmin says you burn (last 14 days).
  const burn14 = [...burnByDay].filter(([d]) => d >= addDays(today, -14)).map(([, v]) => v);
  const avgBurn = burn14.length ? burn14.reduce((a, b) => a + b, 0) / burn14.length : null;

  const insights = nutritionInsights({
    today,
    caloriesByDay: nutrition.caloriesByDay,
    proteinByDay: nutrition.proteinByDay,
    carbsByDay: nutrition.carbsByDay,
    burnByDay,
    exerciseByDay,
    hrvByDay,
    rhrByDay,
    recoveryByDay,
    runs: runs.map((r) => ({ date: r.date, minutes: r.actual_duration_min, km: r.actual_distance_km, avg_hr: r.avg_hr, type: r.run_type })),
    runCarbsByDay: new Map([...intakes].map(([d, v]) => [d, v.carbs_g])),
    carbsPerHour,
    weightKg: weight ? weight.weight_lbs / LB_PER_KG : null,
    bodyFatPct: weight?.body_fat_pct ?? null,
    cutting: avgBurn != null && goals.calories < avgBurn - 250,
  });

  const reportFor = (monday: string): WeeklyReport =>
    weeklyReport({
      week: monday,
      today,
      plan: plan
        ? plan.workouts.filter((w) => w.date >= monday && w.date <= addDays(monday, 6)).map((w) => ({ sport: w.sport, state: w.state, kind: w.kind }))
        : null,
      loadByDay: series(perf.daily, (d) => d.date, (d) => d.load),
      fitnessByDay: new Map(perf.daily.map((d) => [d.date, { fitness: d.fitness, form: d.form }])),
      recoveryByDay,
      hrvByDay,
      rhrByDay,
      sleepByDay: series(sleep, (s) => s.date, (s) => s.score),
      caloriesByDay: nutrition.caloriesByDay,
      proteinByDay: nutrition.proteinByDay,
      calorieTarget: goals.calories,
      proteinTarget: goals.protein_g,
      runs: runs.map((r) => ({ date: r.date, minutes: r.actual_duration_min, km: r.actual_distance_km, zones: r.metrics?.hr_zone_min ?? null })),
    });

  const thisWeek = mondayOf(today);
  const selected = week && week <= thisWeek && week >= addDays(thisWeek, -7 * 11) ? mondayOf(week) : thisWeek;
  return {
    today,
    report: reportFor(selected),
    previous: selected === thisWeek ? reportFor(addDays(thisWeek, -7)) : null,
    insights,
  };
});
