/**
 * Weekly AI review of the training plan (server-only). Once per week (Monday)
 * Claude reads last week's compliance, Recovery, load, injuries and nutrition
 * plus next week's workouts, and returns a short review and at most three
 * concrete changes. Changes are validated against the real plan and stored
 * as suggestions — nothing changes until Parker accepts one.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { getActivePlan, saveSuggestions, type PlanWorkoutView } from "@/lib/data/plan";
import { getInjuries } from "@/lib/data/injuries";
import { getNutritionByDay, getNutritionGoals } from "@/lib/data/nutrition";
import { getPerformance } from "@/lib/data/performance";
import { injuryName } from "@/lib/injuries";
import { easySteps, mondayOf, targets } from "@/lib/plan-engine";
import { addDays } from "@/lib/utils";
import type { PlanOp } from "@/types";

export const PLAN_REVIEW_MODEL = "claude-opus-5-5";

const ChangeSchema = z.object({
  workout_id: z.string(),
  action: z.enum(["move", "shorten", "make_easy", "skip", "swap_to_ride"]),
  /** For move: YYYY-MM-DD within next week. */
  date: z.string().nullable(),
  /** For shorten: new duration in minutes. */
  duration_min: z.number().nullable(),
});

const ReviewSchema = z.object({
  summary: z.string(),
  suggestions: z
    .array(z.object({ title: z.string(), reason: z.string(), changes: z.array(ChangeSchema) }))
    .max(3),
});

const SYSTEM = `You are the running coach inside Kova, a personal training app. Parker is a newer runner building from run/walk toward a 14.2-mile race, who also lifts and rides. You review one week at a time.

Write "summary" as 2–4 plain sentences: what last week showed (compliance, Recovery, load, injuries, nutrition) and the focus for next week. Be specific with numbers from the data. No hype.

Propose at most 3 suggestions, only when the data supports a change — an empty list is a good answer when the plan fits. Each suggestion changes workouts in next_week by id:
- move: to another date in next week (no two runs on one day; keep the long run away from hard sessions)
- shorten: set duration_min (never below 15)
- make_easy: turn a quality session into an easy run
- skip: drop a session
- swap_to_ride: replace a run with an easy ride (for lower-body pain)
Respect the rules: never progress run/walk levels while lower-body pain is rising; ramp ratio above 1.5 means reduce; Recovery averaging under 50 means fewer hard sessions. Kova is not medical advice — for red-flag pain, say to see a professional instead of adjusting.`;

export async function reviewContext() {
  const [active, perf, injuries] = await Promise.all([getActivePlan(), getPerformance(90), getInjuries(false)]);
  if (!active) return null;
  const today = perf.today;
  const week = mondayOf(today);
  const lastWeekStart = addDays(week, -7);
  const [nutrition, goals] = await Promise.all([getNutritionByDay(14), getNutritionGoals(today)]);
  const view = (w: PlanWorkoutView) => ({
    id: w.id,
    date: w.date,
    sport: w.sport,
    kind: w.kind,
    title: w.title,
    duration_min: w.duration_min,
    state: w.state,
    actual: w.actual,
  });
  const lastDates = Array.from({ length: 7 }, (_, i) => addDays(lastWeekStart, i));
  const kcal = lastDates.map((d) => nutrition.caloriesByDay.get(d)).filter((v): v is number => v != null);
  const protein = lastDates.map((d) => nutrition.proteinByDay.get(d)).filter((v): v is number => v != null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
  return {
    active,
    week,
    context: {
      today,
      race: active.race ? { date: active.race.date, days_until: active.race.days_until } : null,
      phase: active.current,
      last_week: active.workouts.filter((w) => w.date >= lastWeekStart && w.date < week).map(view),
      next_week: active.workouts.filter((w) => w.date >= today && w.date < addDays(week, 7) && w.state !== "skipped").map(view),
      recovery_last_7: perf.recoveryHistory.slice(-7),
      fitness: perf.current,
      injuries: injuries.map((v) => ({
        name: injuryName(v.injury),
        type: v.injury.injury_type,
        severity: v.severity,
        trend: v.checkins.slice(-4).map((c) => c.severity),
        red_flags: v.injury.symptoms,
      })),
      nutrition_last_week: {
        days_logged: kcal.length,
        avg_calories: avg(kcal),
        avg_protein_g: avg(protein),
        calorie_target: goals.calories,
        protein_target_g: goals.protein_g,
      },
    },
    easyTarget: targets({ paceZones: perf.paceZones, hrFloors: perf.hrZones?.floors ?? null }).easy,
  };
}

/** AI change → plan op, or null when it doesn't fit the real plan. */
export function toOp(
  change: z.infer<typeof ChangeSchema>,
  byId: Map<string, PlanWorkoutView>,
  window: { from: string; to: string },
  easyTarget: string | null,
): PlanOp | null {
  const w = byId.get(change.workout_id);
  if (!w || !(w.state === "upcoming" || w.state === "today")) return null;
  const minutes = Math.round(w.duration_min ?? 30);
  switch (change.action) {
    case "move":
      return change.date && change.date >= window.from && change.date <= window.to
        ? { op: "update", id: w.id, changes: { date: change.date } }
        : null;
    case "shorten": {
      const d = change.duration_min != null ? Math.round(change.duration_min) : null;
      return d != null && d >= 15 && d < minutes
        ? { op: "update", id: w.id, changes: { duration_min: d, title: w.title.replace(/· \d+ min/, `· ${d} min`) } }
        : null;
    }
    case "make_easy":
      return w.sport === "run"
        ? { op: "update", id: w.id, changes: { kind: "easy", title: `Easy run · ${minutes} min`, steps: easySteps(minutes, easyTarget), notes: `Was: ${w.title}` } }
        : null;
    case "skip":
      return { op: "skip", id: w.id };
    case "swap_to_ride":
      return w.sport === "run"
        ? {
            op: "update",
            id: w.id,
            changes: {
              sport: "ride",
              kind: "endurance",
              title: `Easy ride (instead of run) · ${minutes} min`,
              steps: [{ label: "Easy ride", minutes, target: easyTarget }],
              notes: `Was: ${w.title}`,
            },
          }
        : null;
  }
}

/**
 * Run this week's review if it hasn't run yet. One Claude call per week; a
 * missing API key or a refusal just skips the week.
 */
export async function runWeeklyReviewIfDue(): Promise<"ran" | "skipped" | "not_due"> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) return "skipped";
  const ctx = await reviewContext();
  if (!ctx) return "skipped";
  const db = createServiceClient();
  const { data: existing } = await db
    .from("plan_reviews")
    .select("id")
    .eq("plan_id", ctx.active.plan.id)
    .eq("week_start", ctx.week)
    .maybeSingle();
  if (existing) return "not_due";

  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: PLAN_REVIEW_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(ReviewSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Week data (JSON):\n${JSON.stringify(ctx.context)}` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return "skipped";
  const review = response.parsed_output;

  const byId = new Map(ctx.active.workouts.map((w) => [w.id, w]));
  const window = { from: ctx.context.today, to: addDays(ctx.week, 6) };
  const proposals = review.suggestions.flatMap((s, i) => {
    const ops = s.changes.map((c) => toOp(c, byId, window, ctx.easyTarget)).filter((o): o is PlanOp => o != null);
    return ops.length ? [{ key: `ai:${ctx.week}:${i}`, title: s.title, reason: s.reason, ops }] : [];
  });

  await db.from("plan_reviews").upsert(
    { plan_id: ctx.active.plan.id, week_start: ctx.week, summary: review.summary.trim() },
    { onConflict: "plan_id,week_start" },
  );
  await saveSuggestions(ctx.active.plan.id, "ai", proposals);
  return "ran";
}
