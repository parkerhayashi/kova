import { createServiceClient } from "@/lib/supabase/server";
import {
  buildWeightMetrics,
  countProteinDaysHit,
  detectCutPhase,
  averageMapValues,
  generateCutCoachAi,
  generateCutCoachFallback,
  type CutCoachContext,
  type CutCoachResult,
  isCutCoachAiConfigured,
} from "@/lib/cut-coach";
import { getDailyTotals, getNutritionByDay, getNutritionGoals } from "@/lib/data/nutrition";
import { getCarbLoadDates, withoutDates } from "@/lib/data/running";
import { getMorningBodyBattery } from "@/lib/data/garmin";
import { getTimezone, getUserSettings } from "@/lib/data/oura";
import { getUserProfile } from "@/lib/data/profile";
import { getWeightLogs } from "@/lib/data/tracking";
import { getLiftingCompositionSnapshot } from "@/lib/data/workouts";
import { todayInTimezone } from "@/lib/utils";
import { unstable_noStore } from "next/cache";
import { after } from "next/server";

/** Bump when coach metrics/prompt change so same-day cache can't serve stale copy. */
const CACHE_VERSION = 6;

type CutCoachCacheEntry = {
  date: string;
  version: number;
  result: CutCoachResult;
  /** Invalidate when calorie targets change (e.g. TDEE formula updates). */
  goal_calories: number;
  maintenance_calories: number;
};

type CutCoachCache = {
  daily?: CutCoachCacheEntry;
};

type CoachGoalFingerprint = {
  goal_calories: number;
  maintenance_calories: number;
};

function isFreshEntry(
  entry: CutCoachCacheEntry | undefined,
  today: string,
  phase?: CutCoachResult["phase"],
  goals?: CoachGoalFingerprint,
): entry is CutCoachCacheEntry {
  return (
    entry != null &&
    entry.date === today &&
    entry.version === CACHE_VERSION &&
    (phase == null || entry.result.phase === phase) &&
    (goals == null ||
      (entry.goal_calories === goals.goal_calories &&
        entry.maintenance_calories === goals.maintenance_calories))
  );
}

async function readCache(today: string): Promise<CutCoachCache> {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("user_settings")
      .select("cut_coach_cache")
      .limit(1)
      .maybeSingle();
    if (error) {
      console.error("[cut-coach] cache read failed", error.message);
      return {};
    }
    const cache = (data as { cut_coach_cache?: CutCoachCache } | null)
      ?.cut_coach_cache;
    if (!cache) return {};
    const out: CutCoachCache = {};
    if (isFreshEntry(cache.daily, today)) out.daily = cache.daily;
    return out;
  } catch (err) {
    console.error("[cut-coach] cache read failed", err);
    return {};
  }
}

async function writeCache(
  today: string,
  result: CutCoachResult,
  goals: CoachGoalFingerprint,
): Promise<void> {
  try {
    const db = createServiceClient();
    const { data: row, error } = await db
      .from("user_settings")
      .select("id")
      .limit(1)
      .maybeSingle();
    if (error || !row) return;

    // Daily only — rewriting the whole object also drops any old weekly entry.
    const next: CutCoachCache = {
      daily: {
        date: today,
        version: CACHE_VERSION,
        result,
        goal_calories: goals.goal_calories,
        maintenance_calories: goals.maintenance_calories,
      },
    };

    await db
      .from("user_settings")
      .update({ cut_coach_cache: next })
      .eq("id", (row as { id: string }).id);
  } catch (err) {
    console.error("[cut-coach] cache write failed", err);
  }
}

async function gatherContext(): Promise<CutCoachContext> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);

  const [
    settings,
    profile,
    goals,
    todayTotals,
    { caloriesByDay: rawCalories, proteinByDay },
    weightLogs,
    lifting,
    bodyBatteryMorning,
    loadDays,
  ] = await Promise.all([
    getUserSettings(),
    getUserProfile(),
    getNutritionGoals(today),
    getDailyTotals(today),
    getNutritionByDay(14),
    getWeightLogs(30),
    getLiftingCompositionSnapshot(30),
    getMorningBodyBattery(today),
    getCarbLoadDates(14),
  ]);
  // Planned carb-load days never count toward intake drift.
  const caloriesByDay = withoutDates(rawCalories, loadDays);

  const weightEntries = weightLogs.map((row) => ({
    dateKey: row.date,
    weight: row.weight_lbs,
  }));

  const weight = buildWeightMetrics(weightEntries, today);
  weight.goal_lbs = settings?.weight_goal_lbs ?? null;
  if (weight.current_lbs == null && profile.weight_lbs != null) {
    weight.current_lbs = profile.weight_lbs;
  }

  const avgCal = averageMapValues(caloriesByDay, today, 7, {
    excludeEndDate: true,
  });
  const avgProtein = averageMapValues(proteinByDay, today, 7, {
    excludeEndDate: true,
  });
  const loggedDays7 = avgCal?.count ?? 0;

  const phase = detectCutPhase({
    weight_lbs: weight.current_lbs,
    weight_goal_lbs: weight.goal_lbs,
    body_fat_pct: goals.meta.current_body_fat_pct ?? profile.body_fat_pct,
    body_fat_goal_pct: settings?.body_fat_goal_pct ?? null,
    reverse_diet_active: goals.meta.reverse_diet_active,
    diet_break_active: goals.meta.diet_break_active,
  });


  return {
    phase,
    mode: "daily",
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
        { excludeEndDate: true },
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
    body_battery_morning: bodyBatteryMorning,
    body_fat_goal_pct: settings?.body_fat_goal_pct ?? null,
    body_fat_pct: goals.meta.current_body_fat_pct ?? profile.body_fat_pct,
  };
}

function fingerprintFromContext(ctx: CutCoachContext): CoachGoalFingerprint {
  return {
    goal_calories: ctx.nutrition.goal_calories,
    maintenance_calories: ctx.nutrition.maintenance_calories,
  };
}

/** Regenerate today's coach with AI after the response and cache it. */
async function refreshCutCoachAiInBackground(
  today: string,
  ctx: CutCoachContext,
): Promise<void> {
  if (!isCutCoachAiConfigured()) return;
  const result = await generateCutCoachAi(ctx);
  await writeCache(today, result, fingerprintFromContext(ctx));
}

/**
 * Today's coach (Home + Muse). Fresh cache, else rules copy now and one AI
 * refresh after the response. The weekly coach was removed to save AI calls.
 */
export async function getCutCoachDaily(): Promise<{
  daily: CutCoachResult;
  aiConfigured: boolean;
}> {
  unstable_noStore();
  const aiConfigured = isCutCoachAiConfigured();
  try {
    const timezone = await getTimezone();
    const today = todayInTimezone(timezone);
    const [cache, ctx] = await Promise.all([readCache(today), gatherContext()]);
    const goals = fingerprintFromContext(ctx);
    if (isFreshEntry(cache.daily, today, ctx.phase, goals)) {
      return { daily: cache.daily.result, aiConfigured };
    }
    const daily = generateCutCoachFallback(ctx);
    await writeCache(today, daily, goals);
    if (aiConfigured) {
      after(() =>
        refreshCutCoachAiInBackground(today, ctx).catch((err) =>
          console.error("[cut-coach] background AI refresh failed", err),
        ),
      );
    }
    return { daily, aiConfigured };
  } catch (err) {
    console.error("[cut-coach] daily failed, using rules fallback", err);
    return { daily: generateCutCoachFallback(await gatherContext()), aiConfigured };
  }
}
