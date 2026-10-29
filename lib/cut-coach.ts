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

export type CutPhase = "cut" | "bulk" | "maintain" | "reverse" | "diet_break";
/** Daily only — the weekly coach was removed to save AI calls (Oct 2026). */
export type CutCoachMode = "daily";
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
    /**
     * Primary storytelling rate (lb/week) from 7-day rolling-average change.
     * Prefer this over the longer 14-day pace — that lags after a big early drop.
     */
    weekly_rate_lbs: number | null;
    /** Recent 3-day avg minus 3-day avg ~7 days ago (spike-resistant "this week"). */
    scale_week_lbs: number | null;
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

export function coachSectionTitle(phase: CutPhase): string {
  switch (phase) {
    case "cut":
      return "Cut coach";
    case "bulk":
      return "Lean bulk coach";
    case "maintain":
      return "Maintain coach";
    case "reverse":
      return "Reverse diet coach";
    case "diet_break":
      return "Diet break coach";
  }
}

export function coachPhaseLabel(phase: CutPhase): string {
  switch (phase) {
    case "cut":
      return "Cut";
    case "bulk":
      return "Lean bulk";
    case "maintain":
      return "Maintain";
    case "reverse":
      return "Reverse";
    case "diet_break":
      return "Diet break";
  }
}

function insufficientDataCopy(phase: CutPhase): {
  headline: string;
  summary: string;
} {
  switch (phase) {
    case "bulk":
      return {
        headline: "Need more logs to coach your lean bulk",
        summary:
          "Log weight most days and track calories on at least 5 of the last 7 days. Strength data from Hevy or Kova confirms you are gaining muscle, not just scale weight.",
      };
    case "maintain":
      return {
        headline: "Need more logs for maintain coaching",
        summary:
          "Log weight and calories on most days so the coach can see if you are holding steady.",
      };
    case "reverse":
      return {
        headline: "Need more logs for reverse-diet coaching",
        summary:
          "Log weight most mornings and hit calories on at least 5 of the last 7 days so the reverse ramp can review weekly.",
      };
    case "diet_break":
      return {
        headline: "Need more logs for diet-break coaching",
        summary:
          "Log weight and calories on most days so the coach can confirm you are holding steady at maintenance.",
      };
    default:
      return {
        headline: "Need more logs to coach your cut",
        summary:
          "Log weight most days and track calories on at least 5 of the last 7 days. Strength data from Hevy or Kova helps refine the read.",
      };
  }
}
export function detectCutPhase(input: {
  weight_lbs: number | null;
  weight_goal_lbs: number | null;
  body_fat_pct: number | null;
  body_fat_goal_pct: number | null;
  reverse_diet_active?: boolean;
  diet_break_active?: boolean;
}): CutPhase {
  if (input.diet_break_active) return "diet_break";
  if (input.reverse_diet_active) return "reverse";
  const weight = input.weight_lbs;
  const goal = input.weight_goal_lbs;
  if (weight != null && goal != null) {
    if (weight > goal + 0.5) return "cut";
    if (weight < goal) return "bulk";
    if (Math.abs(weight - goal) <= 0.5) return "maintain";
  }
  if (
    input.body_fat_pct != null &&
    input.body_fat_goal_pct != null &&
    input.body_fat_pct > input.body_fat_goal_pct + 0.5
  ) {
    return "cut";
  }
  return "cut";
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Closest weigh-in on or before `dateKey`, within `toleranceDays`. */
function weightOnOrBefore(
  sorted: WeightEntry[],
  dateKey: string,
  toleranceDays = 2,
): number | null {
  const earliest = addDays(dateKey, -toleranceDays);
  for (let i = sorted.length - 1; i >= 0; i--) {
    const row = sorted[i]!;
    if (row.dateKey > dateKey) continue;
    if (row.dateKey < earliest) break;
    return row.weight;
  }
  return null;
}

/** Mean of weigh-ins in the `days`-long window ending on `endDate`. */
function windowAverageWeight(
  sorted: WeightEntry[],
  endDate: string,
  days: number,
): number | null {
  const start = addDays(endDate, -(days - 1));
  const slice = sorted.filter(
    (row) => row.dateKey >= start && row.dateKey <= endDate,
  );
  if (!slice.length) return null;
  return slice.reduce((sum, row) => sum + row.weight, 0) / slice.length;
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
    endAvg7 != null && startAvg7 != null ? round1(endAvg7 - startAvg7) : null;
  const change_14d_lbs =
    endAvg7 != null && startAvg14 != null ? round1(endAvg7 - startAvg14) : null;
  const current_lbs = sorted.length
    ? sorted[sorted.length - 1]?.weight ?? null
    : null;

  // 3-day averages mute single-day spikes (e.g. one high weigh-in a week ago).
  const recent3 = windowAverageWeight(sorted, endDate, 3);
  const prior3 = windowAverageWeight(sorted, addDays(endDate, -7), 3);
  let scale_week_lbs: number | null =
    recent3 != null && prior3 != null ? round1(recent3 - prior3) : null;
  if (scale_week_lbs == null) {
    const weekAgo = weightOnOrBefore(sorted, addDays(endDate, -7));
    scale_week_lbs =
      current_lbs != null && weekAgo != null
        ? round1(current_lbs - weekAgo)
        : null;
  }

  // Prefer 7-day rolling pace (already lb/week). The 14-day pace lags after a
  // steep early drop and can claim ~1 lb/week loss while the last week is flat.
  const weekly_rate_lbs =
    change_7d_lbs != null
      ? change_7d_lbs
      : change_14d_lbs != null
        ? round1(change_14d_lbs / 2)
        : null;

  return {
    current_lbs,
    goal_lbs: null,
    avg_7d_lbs: endAvg7 != null ? round1(endAvg7) : null,
    change_7d_lbs,
    change_14d_lbs,
    weekly_rate_lbs,
    scale_week_lbs,
  };
}

export function averageMapValues(
  values: Map<string, number>,
  endDate: string,
  days: number,
  options?: { excludeEndDate?: boolean },
): { avg: number; count: number } | null {
  const lastDay = options?.excludeEndDate ? addDays(endDate, -1) : endDate;
  const nums: number[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(lastDay, -(days - 1 - i));
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
  options?: { excludeEndDate?: boolean },
): number {
  const lastDay = options?.excludeEndDate ? addDays(endDate, -1) : endDate;
  const threshold = goalProtein * 0.9;
  let hit = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(lastDay, -(days - 1 - i));
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

  if (!hasEnoughData(ctx)) {
    const copy = insufficientDataCopy(phase);
    return {
      status: "insufficient_data",
      headline: copy.headline,
      summary: copy.summary,
      action: "Log today's meals and weight, then check back tomorrow.",
      mode: ctx.mode,
      phase,
      generated_at: now,
      source: "rules",
    };
  }

  const rate = ctx.weight.weekly_rate_lbs;
  const scaleWeek = ctx.weight.scale_week_lbs;
  const strengthPct =
    ctx.lifting.strength_delta_pct != null
      ? ctx.lifting.strength_delta_pct * 100
      : null;
  const proteinHit = ctx.nutrition.protein_days_hit_7d;
  const avgCal = ctx.nutrition.avg_calories_7d;
  const goalCal = ctx.nutrition.goal_calories;
  /** Scale moved opposite the recent rate this week (water / rebound). */
  const rebounding =
    rate != null &&
    scaleWeek != null &&
    rate < -0.3 &&
    scaleWeek > 0.3;
  /** Longer 14d pace still falling while the last week is flat/up. */
  const longerPace =
    ctx.weight.change_14d_lbs != null
      ? round1(ctx.weight.change_14d_lbs / 2)
      : null;
  const staleLongerLoss =
    rate != null &&
    Math.abs(rate) < 0.3 &&
    longerPace != null &&
    longerPace < -0.4;

  if (phase === "cut") {
    const losing =
      rate != null && rate <= -0.3 && rate > -2.5 && !rebounding;
    const tooFast = rate != null && rate <= -2.5;
    const flat =
      (rate != null && Math.abs(rate) < 0.3) ||
      (rebounding && Math.abs(scaleWeek!) < 1.5);
    const gaining =
      (rate != null && rate >= 0.3 && (scaleWeek == null || scaleWeek > 0)) ||
      (scaleWeek != null && scaleWeek > 0.5 && (rate == null || rate > -0.3));
    const strengthSlipping =
      strengthPct != null && strengthPct < -2 && ctx.lifting.has_data;
    const lowProtein = proteinHit <= 4;

    if (rebounding && !strengthSlipping) {
      return {
        status: "on_track",
        headline: "Scale up this week",
        summary: `Up ${formatRate(scaleWeek)} vs last week, but the 14-day trend is still ${formatRate(rate)}/wk. Likely water/glycogen — not fat regain.`,
        action: "Don't slash calories. Hit protein, keep logging weight, reassess in 5–7 days.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

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
        headline: "Cut on track",
        summary: `Weight ${formatRate(rate)}/wk (7-day pace). Protein hit ${proteinHit}/7 days${strengthPct != null ? ` · strength ${strengthPct >= 0 ? "+" : ""}${strengthPct.toFixed(0)}%` : ""}.`,
        action: "Stay the course — hit protein and log weight tomorrow.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (flat && avgCal != null && avgCal <= goalCal + 100) {
      return {
        status: "adjust",
        headline: staleLongerLoss
          ? "Cut stalled this week"
          : "Weight flat on target intake",
        summary: staleLongerLoss
          ? `Last week is ${formatRate(rate)} (flat) even though the longer 14-day pace was still ${formatRate(longerPace)}/wk. At ~${avgCal} kcal/day (goal ${goalCal}).`
          : `Pace ${formatRate(rate)}/wk at ~${avgCal} kcal/day (goal ${goalCal}). Either water fluctuation or maintenance is lower than estimated.`,
        action: "Hold intake 1 more week; if still flat, trim ~100 kcal or add a short walk block daily.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (gaining && !rebounding) {
      return {
        status: "adjust",
        headline: "Weight trending up",
        summary: `Up ${formatRate(scaleWeek ?? rate)}/wk while cutting. Avg ~${avgCal ?? "—"} kcal vs ${goalCal} goal.`,
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
    const leanGain = rate != null && rate >= 0.15 && rate <= 0.85;
    const tooFast = rate != null && rate > 1.0;
    const flat = rate != null && Math.abs(rate) < 0.15;
    const losing = rate != null && rate < -0.15;
    const strengthUp =
      strengthPct != null && strengthPct >= 0 && ctx.lifting.has_data;
    const strengthDown =
      strengthPct != null && strengthPct < -2 && ctx.lifting.has_data;
    const lowProtein = proteinHit <= 4;
    const goalGap =
      ctx.weight.current_lbs != null && ctx.weight.goal_lbs != null
        ? ctx.weight.goal_lbs - ctx.weight.current_lbs
        : null;

    if (leanGain && !strengthDown && !lowProtein) {
      return {
        status: "on_track",
        headline: "Lean bulk on track",
        summary: `Weight ${formatRate(rate)}/wk (target ~0.25–0.75). Protein ${proteinHit}/7 days${strengthPct != null ? ` · strength ${strengthPct >= 0 ? "+" : ""}${strengthPct.toFixed(0)}%` : ""}.`,
        action: "Stay the course — hit protein and log weight tomorrow.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (tooFast) {
      return {
        status: "adjust",
        headline: "Gaining faster than a lean bulk",
        summary: `Up ${formatRate(rate)}/wk — aim for ~0.25–0.75 lb/wk. Avg ~${avgCal ?? "—"} kcal vs ${goalCal} goal.`,
        action: "Trim ~100–150 kcal for two weeks; keep protein high and watch strength, not the scale alone.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (flat && avgCal != null && avgCal <= goalCal + 150) {
      return {
        status: "adjust",
        headline: "Weight flat — surplus may be too small",
        summary: `7-day change ${formatRate(rate)} at ~${avgCal} kcal/day (goal ${goalCal})${goalGap != null ? ` · ${goalGap.toFixed(1)} lb to weight goal` : ""}.`,
        action: "Add ~100–150 kcal (carbs or fat around training), not a large jump — reassess in 7 days.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (losing) {
      return {
        status: "adjust",
        headline: "Weight drifting down on a bulk",
        summary: `${formatRate(rate)}/wk while trying to lean bulk. Avg ~${avgCal ?? "—"} kcal vs ${goalCal} goal.`,
        action: "Add ~150 kcal and confirm you are logging full portions — lean bulk still needs a consistent small surplus.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (lowProtein) {
      return {
        status: "adjust",
        headline: "Protein first on the bulk",
        summary: `Only ${proteinHit}/7 days hit ${ctx.nutrition.goal_protein_g}g protein. Weight ${formatRate(rate)}/wk.`,
        action: "Lean bulk means muscle gain — close protein before adding more calories.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (strengthDown && (leanGain || tooFast)) {
      return {
        status: "adjust",
        headline: "Strength lagging while weight climbs",
        summary: `Lifts ${strengthPct!.toFixed(0)}% · weight ${formatRate(rate)}/wk. May be gaining too fast or under-recovering.`,
        action: "Hold or slightly reduce surplus, prioritize sleep, and keep protein high before pushing calories up.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (leanGain && strengthUp) {
      return {
        status: "on_track",
        headline: "Lean bulk on track",
        summary: `Weight ${formatRate(rate)}/wk · strength +${strengthPct!.toFixed(0)}%.`,
        action: "Keep the same modest surplus — this is the pace you want.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }
  }

  if (phase === "maintain") {
    const flat = rate != null && Math.abs(rate) < 0.2;
    if (flat && proteinHit >= 5) {
      return {
        status: "on_track",
        headline: "Maintain on track",
        summary: `Weight ${formatRate(rate)}/wk · ~${avgCal ?? "—"} kcal avg · protein ${proteinHit}/7 days.`,
        action: "Hold current intake unless your goal changes.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }
  }

  if (phase === "diet_break") {
    const drifting = rate != null && Math.abs(rate) > 0.35;
    const steady = rate != null && Math.abs(rate) <= 0.25;
    return {
      status: drifting ? "adjust" : "on_track",
      headline: drifting
        ? "Watch the scale this break"
        : "Diet break at maintenance",
      summary: steady
        ? `Goal ${goalCal} (maintenance ~${ctx.nutrition.maintenance_calories}) with pace ${formatRate(rate)}/wk.`
        : `Goal ${goalCal} at maintenance ~${ctx.nutrition.maintenance_calories}. Pace ${formatRate(rate)}/wk.`,
      action: drifting
        ? "Keep eating at the maintenance target and check weigh-ins for consistency — don't resume the cut early."
        : "Stay at maintenance until the break ends, then resume the cut deficit.",
      mode: ctx.mode,
      phase,
      generated_at: now,
      source: "rules",
    };
  }

  if (phase === "reverse") {
    const risingFast = rate != null && rate > 0.45;
    const stable = rate != null && Math.abs(rate) <= 0.25;
    const stillLosing = rate != null && rate < -0.15;
    const gap =
      ctx.nutrition.maintenance_calories - ctx.nutrition.goal_calories;

    if (risingFast) {
      return {
        status: "adjust",
        headline: "Hold this reverse step",
        summary: `Up ${formatRate(rate)}/wk while reversing. Goal ${goalCal} · maintenance ~${ctx.nutrition.maintenance_calories}.`,
        action: "Don't add calories this week. Keep protein high and reassess in 5–7 days.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (gap <= 50 && stable) {
      return {
        status: "on_track",
        headline: "Reverse nearly done",
        summary: `At ~${goalCal} kcal (maintenance ${ctx.nutrition.maintenance_calories}) with pace ${formatRate(rate)}/wk.`,
        action: "Hold here a few more days. If still flat, end reverse and set a maintain goal.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }

    if (stillLosing || (stable && gap > 50)) {
      return {
        status: "on_track",
        headline: "Reverse on track",
        summary: `${Math.max(0, Math.round(gap))} kcal below maintenance · pace ${formatRate(rate)}/wk · protein ${proteinHit}/7.`,
        action: "Hit today's calorie target — the weekly review handles the bump.",
        mode: ctx.mode,
        phase,
        generated_at: now,
        source: "rules",
      };
    }
  }

  return {
    status: "on_track",
    headline: "Keep logging",
    summary: `Weight ${formatRate(rate)}/wk · ~${avgCal ?? "—"} kcal avg · protein ${proteinHit}/7 days.`,
    action: "Log consistently so the coach can tighten recommendations.",
    mode: ctx.mode,
    phase,
    generated_at: now,
    source: "rules",
  };
}

const SYSTEM_PROMPT = `You are a concise body-composition coach for a single user's personal health app (Kova).

You receive structured JSON metrics only — never invent numbers. Phase is cut, bulk, maintain, or reverse (reverse = active reverse diet after a cut).

Rules:
- Weight fields: weekly_rate_lbs is the PRIMARY pace (lb/week) from 7-day rolling averages — use this for "are you losing/gaining this week." change_14d_lbs is the longer window (divide by 2 for lb/week context only). scale_week_lbs is recent 3-day avg vs 3-day avg ~7 days ago.
- NEVER claim ~1 lb/week loss if weekly_rate_lbs is between −0.3 and +0.3 (call it flat/stalled). If change_14d_lbs still shows older loss but weekly_rate_lbs is flat, say the longer trend was down but this week has stalled — do not celebrate a 1 lb/week pace.
- If scale_week_lbs and weekly_rate_lbs disagree by ≥0.5 lb, trust weekly_rate_lbs and mention scale noise.
- Cut: target ~0.5–1.5 lb/week loss while preserving strength. Flag: flat weight at deficit, gaining weight, strength down >2%, protein hit <5/7 days, losing >2.5 lb/week with strength drop.
- Bulk: always treat as LEAN bulk — target ~0.25–0.75 lb/week gain, not aggressive surges. Flag: gaining >1 lb/week, flat weight at surplus, losing weight, strength down >2% while gaining, protein hit <5/7 days. Prefer small calorie nudges (+/−100–150 kcal), never "eat big" advice.
- Maintain: weight stable within ~0.2 lb/week at goal.
- Reverse: climbing calories ~100/week toward maintenance until weight stabilizes. Flag: gaining >0.45 lb/week (hold the ramp), still losing at a large gap below maintenance (stay the course), near maintenance and flat (ready to finish). Never suggest jumping calories by more than ~100–150 at once.
- Match tone and headline to phase (cut / lean bulk / maintain / reverse diet / diet break coach).
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

const COACH_AI_TIMEOUT_MS = 25_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Coach AI timed out")),
      ms,
    );
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}

export async function generateCutCoachAi(
  ctx: CutCoachContext,
): Promise<CutCoachResult> {
  const configError = captureConfigError();
  if (configError) {
    return generateCutCoachFallback(ctx);
  }

  try {
    const { text } = await withTimeout(
      generateText({
        model: anthropic(COACH_MODEL),
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Mode: ${ctx.mode}\n\nContext JSON:\n${JSON.stringify(ctx, null, 2)}`,
          },
        ],
      }),
      COACH_AI_TIMEOUT_MS,
    );

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
