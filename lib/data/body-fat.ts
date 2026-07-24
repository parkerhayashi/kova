import { createServiceClient } from "@/lib/supabase/server";
import {
  buildVisualBodyFatState,
  computeRollingBodyFatEstimate,
  emptyBodyFatEstimateView,
  type BodyFatEstimateView,
} from "@/lib/body-fat-estimate";
import { toWeightEntries } from "@/lib/weight-stats";
import { getTimezone, getUserSettings } from "@/lib/data/oura";
import { getAllWeightLogs } from "@/lib/data/tracking";
import { getLiftingCompositionSnapshot } from "@/lib/data/workouts";
import {
  getNutritionByDay,
  getNutritionGoals,
} from "@/lib/data/nutrition";
import { todayInTimezone } from "@/lib/utils";
import type { VisualBodyFatAnswers, VisualBodyFatState } from "@/types";

function parseVisualState(raw: unknown): VisualBodyFatState | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<VisualBodyFatState>;
  if (
    typeof s.pct !== "number" ||
    typeof s.assessed_at !== "string" ||
    !s.answers ||
    typeof s.answers !== "object"
  ) {
    return null;
  }
  return s as VisualBodyFatState;
}

export async function getVisualBodyFatState(): Promise<VisualBodyFatState | null> {
  const settings = await getUserSettings();
  return parseVisualState(settings?.visual_body_fat_state);
}

export async function saveVisualBodyFatBaseline(input: {
  answers: VisualBodyFatAnswers;
  sex: VisualBodyFatState["sex"];
}): Promise<VisualBodyFatState> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const weights = await getAllWeightLogs();
  const latest = [...weights].sort((a, b) => a.date.localeCompare(b.date)).at(-1);

  const state = buildVisualBodyFatState({
    answers: input.answers,
    sex: input.sex,
    assessed_at: today,
    weight_lbs_at_baseline: latest?.weight_lbs ?? null,
  });

  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!row) throw new Error("Settings not found");

  const { error } = await db
    .from("user_settings")
    .update({ visual_body_fat_state: state })
    .eq("id", row.id);
  if (error) throw new Error(error.message);

  return state;
}

export async function clearVisualBodyFatBaseline(): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (!row) return;
  await db
    .from("user_settings")
    .update({ visual_body_fat_state: null })
    .eq("id", row.id);
}

function sexFromSettings(
  raw: string | null | undefined,
): VisualBodyFatState["sex"] {
  if (raw === "female") return "female";
  if (raw === "other") return "other";
  return "male";
}

/** Full Weight-page body-fat card payload. */
export async function getBodyFatEstimate(): Promise<BodyFatEstimateView> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const settings = await getUserSettings();
  const suggested = sexFromSettings(settings?.biological_sex);
  const baseline = parseVisualState(settings?.visual_body_fat_state);
  if (!baseline) return emptyBodyFatEstimateView(suggested);

  const since = Math.min(
    90,
    Math.max(
      7,
      Math.round(
        (Date.parse(`${today}T12:00:00Z`) -
          Date.parse(`${baseline.assessed_at}T12:00:00Z`)) /
          86_400_000,
      ) || 7,
    ),
  );

  const [weights, lifting, goals] = await Promise.all([
    getAllWeightLogs(),
    getLiftingCompositionSnapshot(since),
    getNutritionGoals(today),
  ]);

  // Average intake vs maintenance over recent logged days (exclude today).
  let energyBalance: number | null = null;
  try {
    const days = Math.min(14, since);
    const { caloriesByDay } = await getNutritionByDay(days);
    const entries = [...caloriesByDay.entries()].filter(
      ([date, cal]) => date < today && cal >= 400,
    );
    if (entries.length >= 3) {
      const avg =
        entries.reduce((s, [, cal]) => s + cal, 0) / entries.length;
      energyBalance = Math.round(avg - goals.meta.maintenance_calories);
    }
  } catch {
    energyBalance = null;
  }

  return computeRollingBodyFatEstimate({
    baseline,
    weights: toWeightEntries(weights),
    strengthDelta: lifting.strengthDelta,
    hasLiftData: lifting.strengthExerciseCount > 0 || lifting.totalSessions > 0,
    sessionsPerWeek: lifting.sessionsPerWeek,
    yearsTraining: 2,
    energyBalanceKcal: energyBalance,
    today,
  });
}
