import { createServiceClient } from "@/lib/supabase/server";
import {
  buildWeightMetrics,
  countProteinDaysHit,
  detectCutPhase,
  averageMapValues,
  generateCutCoachAi,
  generateCutCoachFallback,
  type CutCoachContext,
  type CutCoachMode,
  type CutCoachResult,
  isCutCoachAiConfigured,
} from "@/lib/cut-coach";
import { getDailyTotals, getNutritionByDay, getNutritionGoals } from "@/lib/data/nutrition";
import { getReadinessHistory, getTimezone, getUserSettings } from "@/lib/data/oura";
import { getUserProfile } from "@/lib/data/profile";
import { getWeightLogs } from "@/lib/data/tracking";
import { getLiftingCompositionSnapshot } from "@/lib/data/workouts";
import { todayInTimezone } from "@/lib/utils";
import { unstable_noStore } from "next/cache";

type CutCoachCache = {
  daily?: { date: string; result: CutCoachResult };
  weekly?: { date: string; result: CutCoachResult };
};

async function readCache(today: string): Promise<CutCoachCache> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("cut_coach_cache")
    .limit(1)
    .maybeSingle();
  const cache = (data as { cut_coach_cache?: CutCoachCache } | null)
    ?.cut_coach_cache;
  if (!cache) return {};
  const out: CutCoachCache = {};
  if (cache.daily?.date === today) out.daily = cache.daily;
  if (cache.weekly?.date === today) out.weekly = cache.weekly;
  return out;
}

async function writeCache(
  today: string,
  mode: CutCoachMode,
  result: CutCoachResult,
): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id, cut_coach_cache")
    .limit(1)
    .maybeSingle();
  if (!row) return;

  const existing =
    ((row as { cut_coach_cache?: CutCoachCache }).cut_coach_cache as CutCoachCache) ??
    {};

  const next: CutCoachCache = {
    ...existing,
    [mode]: { date: today, result },
  };

  await db
    .from("user_settings")
    .update({ cut_coach_cache: next })
    .eq("id", (row as { id: string }).id);
}

async function gatherContext(mode: CutCoachMode): Promise<CutCoachContext> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);

  const [
    settings,
    profile,
    goals,
    todayTotals,
    { caloriesByDay, proteinByDay },
    weightLogs,
    lifting,
    readinessRows,
  ] = await Promise.all([
    getUserSettings(),
    getUserProfile(),
    getNutritionGoals(today),
    getDailyTotals(today),
    getNutritionByDay(14),
    getWeightLogs(21),
    getLiftingCompositionSnapshot(30),
    getReadinessHistory(7),
  ]);

  const weightEntries = weightLogs.map((row) => ({
    dateKey: row.date,
    weight: row.weight_lbs,
  }));

  const weight = buildWeightMetrics(weightEntries, today);
  weight.goal_lbs = settings?.weight_goal_lbs ?? null;
  if (weight.current_lbs == null && profile.weight_lbs != null) {
    weight.current_lbs = profile.weight_lbs;
  }

  const avgCal = averageMapValues(caloriesByDay, today, 7);
  const avgProtein = averageMapValues(proteinByDay, today, 7);
  const loggedDays7 = avgCal?.count ?? 0;

  const phase = detectCutPhase({
    weight_lbs: weight.current_lbs,
    weight_goal_lbs: weight.goal_lbs,
    body_fat_pct: profile.body_fat_pct,
    body_fat_goal_pct: settings?.body_fat_goal_pct ?? null,
  });

  const readinessToday =
    readinessRows.find((row) => row.date === today)?.score ?? null;

  return {
    phase,
    mode,
    today,
    weight,
    nutrition: {
      goal_calories: goals.calories,
      goal_protein_g: goals.protein_g,
      today_calories:
        todayTotals.calories != null ? Math.round(todayTotals.calories) : null,
      today_protein_g:
        todayTotals.protein_g != null ? Math.round(todayTotals.protein_g) : null,
      avg_calories_7d: avgCal?.avg ?? null,
      avg_protein_7d: avgProtein?.avg ?? null,
      logged_days_7d: loggedDays7,
      protein_days_hit_7d: countProteinDaysHit(
        proteinByDay,
        today,
        goals.protein_g,
        7,
      ),
      maintenance_calories: goals.meta.maintenance_calories,
      calorie_goal_adjustment: goals.meta.calorie_adjustment,
      adaptive_adjustment: goals.meta.adaptive_adjustment,
    },
    lifting: {
      strength_delta_pct: lifting.strengthExerciseCount
        ? lifting.strengthDelta
        : null,
      sessions_per_week: lifting.workoutDates.length
        ? Math.round(lifting.sessionsPerWeek * 10) / 10
        : null,
      has_data: lifting.strengthExerciseCount > 0,
    },
    readiness_today: readinessToday,
    body_fat_goal_pct: settings?.body_fat_goal_pct ?? null,
    body_fat_pct: profile.body_fat_pct,
  };
}

export async function getCutCoachStatus(
  mode: CutCoachMode,
): Promise<{ result: CutCoachResult; aiConfigured: boolean }> {
  unstable_noStore();

  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const cache = await readCache(today);
  const cached = cache[mode];
  if (cached?.date === today) {
    return { result: cached.result, aiConfigured: isCutCoachAiConfigured() };
  }

  const ctx = await gatherContext(mode);
  const result = isCutCoachAiConfigured()
    ? await generateCutCoachAi(ctx)
    : generateCutCoachFallback(ctx);

  await writeCache(today, mode, result);
  return { result, aiConfigured: isCutCoachAiConfigured() };
}

export async function getCutCoachBundle(): Promise<{
  daily: CutCoachResult;
  weekly: CutCoachResult;
  aiConfigured: boolean;
}> {
  unstable_noStore();

  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const cache = await readCache(today);
  const aiConfigured = isCutCoachAiConfigured();

  const needsDaily = cache.daily?.date !== today;
  const needsWeekly = cache.weekly?.date !== today;

  if (!needsDaily && !needsWeekly) {
    return {
      daily: cache.daily!.result,
      weekly: cache.weekly!.result,
      aiConfigured,
    };
  }

  const [dailyCtx, weeklyCtx] = await Promise.all([
    needsDaily ? gatherContext("daily") : null,
    needsWeekly ? gatherContext("weekly") : null,
  ]);

  const daily =
    cache.daily?.date === today
      ? cache.daily.result
      : await finalizeCoachResult(dailyCtx!, aiConfigured);
  const weekly =
    cache.weekly?.date === today
      ? cache.weekly.result
      : await finalizeCoachResult(weeklyCtx!, aiConfigured);

  if (needsDaily) await writeCache(today, "daily", daily);
  if (needsWeekly) await writeCache(today, "weekly", weekly);

  return { daily, weekly, aiConfigured };
}

async function finalizeCoachResult(
  ctx: CutCoachContext,
  aiConfigured: boolean,
): Promise<CutCoachResult> {
  return aiConfigured
    ? generateCutCoachAi(ctx)
    : generateCutCoachFallback(ctx);
}
