/**
 * Visual body-fat eye test + rolling estimate from weight, lifting, and intake.
 * Absolute % is a visual baseline; the useful signal is change over time.
 */
import {
  computeCompositionEstimate,
  computeWeightTrendFromEntries,
  type WeightEntry,
} from "@/lib/coach-composition";
import type {
  VisualBodyFatAnswers,
  VisualBodyFatState,
} from "@/types";

export type BodyFatConfidence = "low" | "medium" | "high";

export type BodyFatEstimateView = {
  has_baseline: boolean;
  baseline: VisualBodyFatState | null;
  /** Prefill for the eye-test sex control when no baseline yet. */
  suggested_sex: VisualBodyFatState["sex"];
  /** Current point estimate (null until baseline exists). */
  current_pct: number | null;
  band_low: number | null;
  band_high: number | null;
  /** Change in BF points since eye test. */
  delta_pct: number | null;
  fat_lbs: number | null;
  lean_lbs: number | null;
  current_weight_lbs: number | null;
  confidence: BodyFatConfidence;
  headline: string;
  detail: string;
  window_days: number;
  est_muscle_lbs: number | null;
  est_fat_lbs: number | null;
};

const ABS_MALE: Record<VisualBodyFatAnswers["abs"], number> = {
  none: 22,
  faint: 17,
  clear: 13,
  etched: 9,
};

const ABS_FEMALE: Record<VisualBodyFatAnswers["abs"], number> = {
  none: 32,
  faint: 26,
  clear: 21,
  etched: 17,
};

const VEIN_ADJ: Record<VisualBodyFatAnswers["veins"], number> = {
  none: 1.5,
  arms: 0,
  shoulders: -1,
  widespread: -2,
};

const FACE_ADJ: Record<VisualBodyFatAnswers["face"], number> = {
  soft: 1.5,
  some: 0,
  sharp: -1.2,
};

const LOWER_ADJ: Record<VisualBodyFatAnswers["lower"], number> = {
  soft: 1.5,
  shape: 0,
  clear: -1.2,
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Score the eye-test answers into a BF% midpoint + band. */
export function scoreVisualBodyFat(
  answers: VisualBodyFatAnswers,
  sex: VisualBodyFatState["sex"],
): { pct: number; band_low: number; band_high: number } {
  const baseTable = sex === "female" ? ABS_FEMALE : ABS_MALE;
  const loClamp = sex === "female" ? 14 : 6;
  const hiClamp = sex === "female" ? 40 : 35;

  const raw =
    baseTable[answers.abs] +
    VEIN_ADJ[answers.veins] +
    FACE_ADJ[answers.face] +
    LOWER_ADJ[answers.lower];

  const pct = round1(clamp(raw, loClamp, hiClamp));
  const half = 1.5;
  return {
    pct,
    band_low: round1(clamp(pct - half, loClamp, hiClamp)),
    band_high: round1(clamp(pct + half, loClamp, hiClamp)),
  };
}

export function buildVisualBodyFatState(input: {
  answers: VisualBodyFatAnswers;
  sex: VisualBodyFatState["sex"];
  assessed_at: string;
  weight_lbs_at_baseline: number | null;
}): VisualBodyFatState {
  const scored = scoreVisualBodyFat(input.answers, input.sex);
  return {
    ...scored,
    answers: input.answers,
    sex: input.sex,
    assessed_at: input.assessed_at,
    weight_lbs_at_baseline: input.weight_lbs_at_baseline,
  };
}

/**
 * Roll baseline BF forward using weight trend + strength-based muscle/fat split,
 * with a light nudge from calorie balance when available.
 */
export function computeRollingBodyFatEstimate(input: {
  baseline: VisualBodyFatState;
  weights: WeightEntry[];
  strengthDelta: number;
  hasLiftData: boolean;
  sessionsPerWeek: number;
  yearsTraining?: number;
  /** Avg daily intake − maintenance over the window (negative = deficit). */
  energyBalanceKcal?: number | null;
  today: string;
}): BodyFatEstimateView {
  const { baseline, weights, today } = input;
  const sorted = [...weights].sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const baselineWeight =
    baseline.weight_lbs_at_baseline ??
    sorted.find((w) => w.dateKey >= baseline.assessed_at)?.weight ??
    sorted[0]?.weight ??
    null;

  const latest = sorted[sorted.length - 1] ?? null;
  const currentWeight = latest?.weight ?? baselineWeight;

  if (baselineWeight == null || currentWeight == null) {
    return {
      has_baseline: true,
      baseline,
      suggested_sex: baseline.sex,
      current_pct: baseline.pct,
      band_low: baseline.band_low,
      band_high: baseline.band_high,
      delta_pct: 0,
      fat_lbs: null,
      lean_lbs: null,
      current_weight_lbs: currentWeight,
      confidence: "low",
      headline: "Need weigh-ins to update from your eye test.",
      detail: "Log a few morning weights and keep training so the estimate can move.",
      window_days: 0,
      est_muscle_lbs: null,
      est_fat_lbs: null,
    };
  }

  const sinceBaseline = Math.max(
    1,
    Math.round(
      (Date.parse(`${today}T12:00:00Z`) -
        Date.parse(`${baseline.assessed_at}T12:00:00Z`)) /
        86_400_000,
    ),
  );
  const windowDays = Math.min(90, Math.max(7, sinceBaseline));

  const trend = computeWeightTrendFromEntries(sorted, windowDays);
  const weightDelta =
    trend?.weightDelta ?? currentWeight - baselineWeight;
  const actualDays = trend?.actualDays ?? windowDays;

  const composition = computeCompositionEstimate({
    weightDelta,
    actualDays,
    units: "lb",
    yearsTraining: input.yearsTraining ?? 2,
    lift: {
      strengthDelta: input.strengthDelta,
      sessionsPerWeek: input.sessionsPerWeek,
      totalVolumeLbs: 0,
      workoutDayCount: Math.round(input.sessionsPerWeek * (actualDays / 7)),
      hasLiftData: input.hasLiftData,
      liftSource: input.hasLiftData ? "Hevy" : "none",
      strengthExerciseCount: input.hasLiftData ? 4 : 0,
    },
    usedRollingWeight: trend?.usedRollingWeight ?? false,
  });

  let dMuscle = composition.estMuscle;
  let dFat = composition.estFat;

  // Reconcile partition to the actual scale change since baseline.
  const partitioned = dMuscle + dFat;
  const actualDelta = currentWeight - baselineWeight;
  if (Math.abs(partitioned) > 0.05) {
    const scale = actualDelta / partitioned;
    dMuscle *= scale;
    dFat *= scale;
  } else if (Math.abs(actualDelta) >= 0.05) {
    dFat =
      actualDelta * (input.hasLiftData && input.strengthDelta >= 0 ? 0.85 : 0.75);
    dMuscle = actualDelta - dFat;
  }

  // Energy-balance nudge: clear deficit + strength holding → a bit more fat loss.
  const bal = input.energyBalanceKcal;
  if (bal != null && Number.isFinite(bal) && Math.abs(actualDelta) >= 0.2) {
    if (bal < -200 && input.strengthDelta >= -0.01 && dFat < 0) {
      const nudge = Math.min(0.35, Math.abs(dFat) * 0.15);
      dFat -= nudge;
      dMuscle += nudge;
    } else if (bal > 250 && input.strengthDelta < 0.01 && dFat > 0) {
      const nudge = Math.min(0.35, Math.abs(dFat) * 0.15);
      dFat += nudge;
      dMuscle -= nudge;
    }
  }

  const fat0 = baselineWeight * (baseline.pct / 100);
  const lean0 = baselineWeight - fat0;
  let fat1 = Math.max(baselineWeight * 0.04, fat0 + dFat);
  let lean1 = Math.max(lean0 * 0.8, lean0 + dMuscle);
  const sum = fat1 + lean1;
  if (sum > 0.1) {
    fat1 = (fat1 / sum) * currentWeight;
    lean1 = currentWeight - fat1;
  }

  const currentPct = round1(clamp((fat1 / currentWeight) * 100, 4, 45));
  const deltaPct = round1(currentPct - baseline.pct);
  const half = 1.5 + Math.min(1.5, windowDays / 60);
  const bandLow = round1(clamp(currentPct - half, 4, 45));
  const bandHigh = round1(clamp(currentPct + half, 4, 45));

  const weighIns = sorted.filter((w) => w.dateKey >= baseline.assessed_at).length;
  let confidence: BodyFatConfidence = "low";
  if (weighIns >= 10 && input.hasLiftData && windowDays >= 14) confidence = "high";
  else if (weighIns >= 5 || (input.hasLiftData && windowDays >= 7)) confidence = "medium";

  let headline: string;
  if (Math.abs(deltaPct) < 0.4) {
    headline = `About ${currentPct}% — roughly steady since your eye test.`;
  } else if (deltaPct < 0) {
    headline = `About ${currentPct}% — down ~${Math.abs(deltaPct)} pts since your eye test.`;
  } else {
    headline = `About ${currentPct}% — up ~${deltaPct} pts since your eye test.`;
  }

  const detailParts = [
    `Visual baseline ${baseline.pct}% on ${baseline.assessed_at}`,
    composition.headline,
  ];
  if (bal != null && Math.abs(bal) >= 150) {
    detailParts.push(
      bal < 0
        ? `Avg intake ~${Math.abs(Math.round(bal))} kcal under maintenance`
        : `Avg intake ~${Math.round(bal)} kcal over maintenance`,
    );
  }

  return {
    has_baseline: true,
    baseline,
    suggested_sex: baseline.sex,
    current_pct: currentPct,
    band_low: bandLow,
    band_high: bandHigh,
    delta_pct: deltaPct,
    fat_lbs: round1(fat1),
    lean_lbs: round1(lean1),
    current_weight_lbs: round1(currentWeight),
    confidence,
    headline,
    detail: detailParts.filter(Boolean).join(" · "),
    window_days: actualDays,
    est_muscle_lbs: round1(dMuscle),
    est_fat_lbs: round1(dFat),
  };
}

export function emptyBodyFatEstimateView(
  suggested_sex: VisualBodyFatState["sex"] = "male",
): BodyFatEstimateView {
  return {
    has_baseline: false,
    baseline: null,
    suggested_sex,
    current_pct: null,
    band_low: null,
    band_high: null,
    delta_pct: null,
    fat_lbs: null,
    lean_lbs: null,
    current_weight_lbs: null,
    confidence: "low",
    headline: "Take a quick eye test to set a visual baseline.",
    detail:
      "Abs, veins, and definition give a rough starting %, then weight + lifts + intake update the estimate.",
    window_days: 0,
    est_muscle_lbs: null,
    est_fat_lbs: null,
  };
}
