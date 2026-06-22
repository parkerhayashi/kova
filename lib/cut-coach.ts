import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { z } from "zod";
import {
  rollingAverageWeight,
  type WeightEntry,
} from "@/lib/coach-composition";
import { captureConfigError, isCaptureConfigured } from "@/lib/nutrition-capture";
import { addDays } from "@/lib/utils";

export const COACH_MODEL = "claude-sonnet-4-6";

export type CutPhase = "cut" | "bulk" | "maintain";
export type CutCoachMode = "daily" | "weekly";
export type CutCoachStatus = "on_track" | "adjust" | "insufficient_data";

export type CutCoachContext = {
  phase: CutPhase;
  mode: CutCoachMode;
  today: string;
  weight: {
    current_lbs: number | null;
    goal_lbs: number | null;
    avg_7d_lbs: number | null;
    change_7d_lbs: number | null;
    change_14d_lbs: number | null;
    weekly_rate_lbs: number | null;
  };
  nutrition: {
    goal_calories: number;
    goal_protein_g: number;
    today_calories: number | null;
    today_protein_g: number | null;
    avg_calories_7d: number | null;
    avg_protein_7d: number | null;
    logged_days_7d: number;
    protein_days_hit_7d: number;
    maintenance_calories: number;
    calorie_goal_adjustment: number;
    adaptive_adjustment: number;
  };
  lifting: {
    strength_delta_pct: number | null;
    sessions_per_week: number | null;
    has_data: boolean;
  };
  readiness_today: number | null;
  body_fat_goal_pct: number | null;
  body_fat_pct: number | null;
};

export type CutCoachResult = {
  status: CutCoachStatus;
  headline: string;
  summary: string;
  action: string;
  mode: CutCoachMode;
  phase: CutPhase;
  generated_at: string;
  source: "ai" | "rules";
};

const resultSchema = z.object({
  status: z.enum(["on_track", "adjust", "insufficient_data"]),
  headline: z.string().min(1).max(120),
  summary: z.string().min(1).max(500),
  action: z.string().min(1).max(200),
});

export function detectCutPhase(input: {
  weight_lbs: number | null;
  weight_goal_lbs: number | null;
  body_fat_pct: number | null;
  body_fat_goal_pct: number | null;
}): CutPhase {
  const weight = input.weight_lbs;
  const goal = input.weight_goal_lbs;
  if (weight != null && goal != null) {
    if (weight > goal + 0.5) return "cut";
    if (weight < goal - 0.5) return "bulk";
  }
  if (
    input.body_fat_pct != null &&
    input.body_fat_goal_pct != null &&
    input.body_fat_pct > input.body_fat_goal_pct + 0.5
  ) {
    return "cut";
  }
  if (weight != null && goal != null && Math.abs(weight - goal) <= 0.5) {
    return "maintain";
  }
  return "cut";
}

export function buildWeightMetrics(
  entries: WeightEntry[],
  endDate: string,
): CutCoachContext["weight"] {
  const sorted = [...entries].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const endAvg7 = rollingAverageWeight(sorted, endDate, 7);
  const startAvg7 = rollingAverageWeight(sorted, addDays(endDate, -7), 7);
  const startAvg14 = rollingAverageWeight(sorted, addDays(endDate, -14), 7);
  const change_7d_lbs =
    endAvg7 != null && startAvg7 != null ? endAvg7 - startAvg7 : null;
  const change_14d_lbs =
    endAvg7 != null && startAvg14 != null ? endAvg7 - startAvg14 : null;
  const current_lbs = sorted.length
    ? sorted[sorted.length - 1]?.weight ?? null
    : null;

  return {
    current_lbs,
    goal_lbs: null,
    avg_7d_lbs: endAvg7,
    change_7d_lbs,
    change_14d_lbs,
    weekly_rate_lbs:
      change_7d_lbs != null ? Math.round(change_7d_lbs * 10) / 10 : null,
  };
}

export function averageMapValues(
  values: Map<string, number>,
  endDate: string,
  days: number,
): { avg: number; count: number } | null {
  const nums: number[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(endDate, -(days - 1 - i));
    const value = values.get(date);
    if (value != null && value > 0) nums.push(value);
  }
  if (!nums.length) return null;
  return {
    avg: Math.round(nums.reduce((sum, n) => sum + n, 0) / nums.length),
    count: nums.length,
  };
}

export function countProteinDaysHit(
  proteinByDay: Map<string, number>,
  endDate: string,
  goalProtein: number,
  days = 7,
): number {
  const threshold = goalProtein * 0.9;
  let hit = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(endDate, -(days - 1 - i));
    const protein = proteinByDay.get(date);
    if (protein != null && protein >= threshold) hit += 1;
  }
  return hit;
}

function hasEnoughData(ctx: CutCoachContext): boolean {
  return (
    ctx.weight.current_lbs != null &&
    ctx.nutrition.logged_days_7d >= 5 &&
    (ctx.weight.change_7d_lbs != null || ctx.weight.change_14d_lbs != null)
  );
}

function formatRate(lbs: number | null): string {
  if (lbs == null) return "unknown";
  if (Math.abs(lbs) < 0.05) return "flat";
  return `${lbs > 0 ? "+" : ""}${lbs.toFixed(1)} lb`;
}

export function generateCutCoachFallback(ctx: CutCoachContext): CutCoachResult {
  const now = new Date().toISOString();
  const phase = ctx.phase;
  const isWeekly = ctx.mode === "weekly";

  if (!hasEnoughData(ctx)) {
    return {
      status: "insufficient_data",
      headline: "Need more logs to coach your cut",
      summary:
        "Log weight most days and track calories on at least 5 of the last 7 days. Strength data from Hevy or Kova helps refine the read.",
      action: "Log today's meals and weight, then check back tomorrow.",
      mode: ctx.mode,
      phase,
      generated_at: now,
      source: "rules",
    };
  }

  const rate = ctx.weight.weekly_rate_lbs;
  const strengthPct =
    ctx.lifting.strength_delta_pct != null
      ? ctx.lifting.strength_delta_pct * 100
      : null;
  const proteinHit = ctx.nutrition.protein_days_hit_7d;
  const avgCal = ctx.nutrition.avg_calories_7d;
  const goalCal = ctx.nutrition.goal_calories;

  if (phase === "cut") {
    const losing =
      rate != null && rate < -0.15 && rate > -2.5;
    const tooFast = rate != null && rate <= -2.5;
    const flat = rate != null && Math.abs(rate) < 0.15;
    const gaining = rate != null && rate > 0.15;
    const strengthSlipping =
      strengthPct != null && strengthPct < -2 && ctx.lifting.has_data;
    const lowProtein = proteinHit <= 4;

    if (tooFast && strengthSlipping) {
      return {
        status: "adjust",
        headline: "Cut may be too aggressive",
        summary: `Weight ${formatRate(rate)}/wk while strength is ${strengthPct!.toFixed(0)}%. Avg intake ~${avgCal ?? "—"} kcal vs ${goalCal} goal.`,
        action: "Add ~150–200 kcal (protein first) for a week and re-check strength.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (losing && !strengthSlipping && !lowProtein) {
      return {
        status: "on_track",
        headline: isWeekly ? "Solid cut week" : "Cut on track",
        summary: `Weight ${formatRate(rate)}/wk. Protein hit ${proteinHit}/7 days${strengthPct != null ? ` · strength ${strengthPct >= 0 ? "+" : ""}${strengthPct.toFixed(0)}%` : ""}.`,
        action: isWeekly
          ? "Keep calories and protein steady next week."
          : "Stay the course — hit protein and log weight tomorrow.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (flat && avgCal != null && avgCal <= goalCal + 100) {
      return {
        status: "adjust",
        headline: "Weight flat on target intake",
        summary: `7-day weight change ${formatRate(rate)} at ~${avgCal} kcal/day (goal ${goalCal}). Either water fluctuation or maintenance is lower than estimated.`,
        action: "Hold intake 1 more week; if still flat, trim ~100 kcal or add a short walk block daily.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (gaining) {
      return {
        status: "adjust",
        headline: "Weight trending up",
        summary: `Up ${formatRate(rate)}/wk while cutting. Avg ~${avgCal ?? "—"} kcal vs ${goalCal} goal.`,
        action: "Audit logging gaps, then remove ~150 kcal or swap a carb-heavy meal for your cutting Chipotle bowl.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (lowProtein) {
      return {
        status: "adjust",
        headline: "Protein is the bottleneck",
        summary: `Only ${proteinHit}/7 days hit protein target (${ctx.nutrition.goal_protein_g}g). Weight ${formatRate(rate)}/wk.`,
        action: "Default to saved high-protein meals and close the protein gap before worrying about calories.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (strengthSlipping) {
      return {
        status: "adjust",
        headline: "Strength slipping on the cut",
        summary: `Lifts ${strengthPct!.toFixed(0)}% over the window. Weight ${formatRate(rate)}/wk.`,
        action: "Keep protein high; if sleep/readiness is low, reduce set volume before cutting calories further.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }
  }

  if (phase === "bulk") {
    const gaining = rate != null && rate > 0.1;
    const strengthUp =
      strengthPct != null && strengthPct >= 0 && ctx.lifting.has_data;

    if (gaining && strengthUp) {
      return {
        status: "on_track",
        headline: isWeekly ? "Good bulk week" : "Bulk on track",
        summary: `Weight ${formatRate(rate)}/wk · strength ${strengthPct != null && strengthPct >= 0 ? "+" : ""}${strengthPct!.toFixed(0)}%.`,
        action: "Keep surplus steady and protein high.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }
  }

  return {
    status: "on_track",
    headline: isWeekly ? "Week in review" : "Keep logging",
    summary: `Weight ${formatRate(rate)}/wk · ~${avgCal ?? "—"} kcal avg · protein ${proteinHit}/7 days.`,
    action: "Log consistently so the coach can tighten recommendations.",
    mode: ctx.mode,
    phase,
    generated_at: now,
    source: "rules",
  };
}

const SYSTEM_PROMPT = `You are a concise cut/bulk coach for a single user's personal health app (Kova).

You receive structured JSON metrics only — never invent numbers. Phase is cut, bulk, or maintain.

Rules:
- Cut: target ~0.5–1.5 lb/week loss while preserving strength. Flag: flat weight 2+ weeks at deficit, gaining weight, strength down >2%, protein hit <5/7 days, losing >2.5 lb/week with strength drop.
- Bulk (future): slow gain with strength up.
- Be direct, no medical advice, no hype. 1 headline (≤12 words), 2 short summary sentences, 1 concrete action.
- status: on_track | adjust | insufficient_data (use insufficient_data only if logged_days_7d < 5 or no weight).

Return ONLY JSON:
{
  "status": "on_track" | "adjust" | "insufficient_data",
  "headline": string,
  "summary": string,
  "action": string
}`;

function parseCoachResponse(text: string): z.infer<typeof resultSchema> {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in coach response");
  return resultSchema.parse(JSON.parse(jsonMatch[0]));
}

export async function generateCutCoachAi(
  ctx: CutCoachContext,
): Promise<CutCoachResult> {
  const configError = captureConfigError();
  if (configError) {
    return generateCutCoachFallback(ctx);
  }

  try {
    const { text } = await generateText({
      model: anthropic(COACH_MODEL),
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Mode: ${ctx.mode}\n\nContext JSON:\n${JSON.stringify(ctx, null, 2)}`,
        },
      ],
    });

    if (!text?.trim()) {
      return generateCutCoachFallback(ctx);
    }

    const parsed = parseCoachResponse(text);
    return {
      ...parsed,
      mode: ctx.mode,
      phase: ctx.phase,
      generated_at: new Date().toISOString(),
      source: "ai",
    };
  } catch {
    return generateCutCoachFallback(ctx);
  }
}

export { isCaptureConfigured as isCutCoachAiConfigured };
