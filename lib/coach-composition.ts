/**
 * Weight composition estimates — splits scale change into muscle vs fat using
 * Hevy lifting signals (strength trend, training frequency, volume).
 */
import type { UnifiedWorkingSet } from "@/lib/lifting-unified";
import { estimate1RM, setVolume } from "@/lib/workouts";

export type WeightEntry = { dateKey: string; weight: number };

export type LiftingCompositionSnapshot = {
  updatedAt: string;
  windowDays: number;
  periodStart: string;
  periodEnd: string;
  workoutDates: string[];
  totalVolumeLbs: number;
  totalSessions: number;
  totalSets: number;
  sessionsPerWeek: number;
  strengthDelta: number;
  strengthExerciseCount: number;
  source: "hevy";
};

export type CompositionLiftSignals = {
  strengthDelta: number;
  sessionsPerWeek: number;
  totalVolumeLbs: number;
  workoutDayCount: number;
  hasLiftData: boolean;
  liftSource: string;
  strengthExerciseCount: number;
};

export type CompositionEstimate = {
  headline: string;
  headlineCls: "good" | "warn" | "bad" | "";
  estMuscle: number;
  estFat: number;
  musclePct: number;
  fatPct: number;
  strengthDelta: number;
  sessionsPerWeek: number;
  totalVolumeLbs: number;
  actualDays: number;
  hasLiftData: boolean;
  liftSource: string;
  liftingMeta: string;
  footLine: string;
  /** True when weight change uses 7-day rolling averages. */
  usedRollingWeight: boolean;
};

function parseDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function dateKeyFromDate(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

/** Mean weight over the trailing `days` ending on `endDateKey` (inclusive). */
export function rollingAverageWeight(
  entries: WeightEntry[],
  endDateKey: string,
  days = 7,
): number | null {
  if (!entries.length) return null;

  const end = parseDateKey(endDateKey);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  const startKey = dateKeyFromDate(start);

  const slice = entries.filter(
    (e) => e.dateKey >= startKey && e.dateKey <= endDateKey,
  );
  if (!slice.length) return null;

  return slice.reduce((sum, e) => sum + e.weight, 0) / slice.length;
}

/** Weight trend over a window using 7-day rolling averages when possible. */
export function computeWeightTrendFromEntries(
  entries: WeightEntry[],
  windowDays: number,
): {
  weightDelta: number;
  actualDays: number;
  endAvg7: number | null;
  startAvg7: number | null;
  usedRollingWeight: boolean;
} | null {
  if (entries.length < 2) return null;

  const sorted = [...entries].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  const endEntry = sorted[sorted.length - 1];
  const endDate = parseDateKey(endEntry.dateKey);
  const windowStart = new Date(endDate);
  windowStart.setDate(windowStart.getDate() - windowDays);
  const windowStartKey = dateKeyFromDate(windowStart);

  const startEntry =
    sorted.find((e) => e.dateKey >= windowStartKey) ?? sorted[0];
  const actualDays = Math.max(
    1,
    Math.round(
      (parseDateKey(endEntry.dateKey).getTime() -
        parseDateKey(startEntry.dateKey).getTime()) /
        86400000,
    ),
  );

  const endAvg7 = rollingAverageWeight(sorted, endEntry.dateKey, 7);

  const startAnchor = new Date(parseDateKey(startEntry.dateKey));
  startAnchor.setDate(
    startAnchor.getDate() + Math.min(6, Math.max(0, Math.floor(actualDays / 3))),
  );
  const startAvg7 =
    rollingAverageWeight(sorted, dateKeyFromDate(startAnchor), 7) ??
    rollingAverageWeight(sorted, startEntry.dateKey, 7);

  if (endAvg7 == null) return null;

  const usedRollingWeight = startAvg7 != null;
  const weightDelta = usedRollingWeight
    ? endAvg7 - startAvg7
    : endEntry.weight - startEntry.weight;

  return {
    weightDelta,
    actualDays,
    endAvg7,
    startAvg7,
    usedRollingWeight,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Split scale change into muscle vs fat using lift strength as the main signal. */
function partitionWeightChange(
  weightDelta: number,
  strengthDelta: number,
  hasLiftData: boolean,
  weeks: number,
  maxMusclePerWeek: number,
): { estMuscle: number; estFat: number } {
  if (Math.abs(weightDelta) < 0.05) {
    return { estMuscle: 0, estFat: 0 };
  }

  if (!hasLiftData) {
    if (weightDelta > 0) {
      const estMuscle = Math.min(maxMusclePerWeek * weeks * 0.5, weightDelta * 0.4);
      return { estMuscle, estFat: weightDelta - estMuscle };
    }
    const loss = Math.abs(weightDelta);
    return { estMuscle: -loss * 0.15, estFat: -(loss * 0.85) };
  }

  const sd = strengthDelta;

  if (weightDelta > 0) {
    let muscleShare: number;
    if (sd >= 0.03) {
      muscleShare = 0.55 + Math.min(0.35, sd * 4);
    } else if (sd >= -0.015) {
      muscleShare = 0.28 + (sd + 0.015) * 6;
    } else {
      muscleShare = Math.max(0.06, 0.18 + sd * 2.5);
    }
    muscleShare = clamp(muscleShare, 0.05, 0.9);
    const estMuscle = weightDelta * muscleShare;
    return { estMuscle, estFat: weightDelta - estMuscle };
  }

  const loss = Math.abs(weightDelta);
  if (sd >= 0.02) {
    const estMuscle = Math.min(0.35, loss * (0.04 + sd * 0.5));
    return { estMuscle, estFat: -loss };
  }
  if (sd >= -0.02) {
    const muscleLoss = loss * 0.14;
    return { estMuscle: -muscleLoss, estFat: -(loss - muscleLoss) };
  }
  const muscleLossShare = clamp(0.15 + Math.abs(sd) * 2.2, 0.15, 0.5);
  const estMuscle = -loss * muscleLossShare;
  return { estMuscle, estFat: -(loss + estMuscle) };
}

function formatWeightDelta(units: string, delta: number, rolling: boolean): string {
  const prefix = rolling ? "7d avg " : "";
  if (delta > 0) return `+${delta.toFixed(1)} ${units} (${prefix}trend)`;
  return `−${Math.abs(delta).toFixed(1)} ${units} (${prefix}trend)`;
}

export function computeStrengthDeltaFromSets(
  sets: UnifiedWorkingSet[],
  periodStart: string,
): { strengthDelta: number; exerciseCount: number } {
  const sessionBest = new Map<string, number>();

  for (const set of sets) {
    if (set.is_warmup || !set.weight_lbs || set.weight_lbs <= 0 || !set.reps) {
      continue;
    }
    const key = `${set.exercise_name}|${set.date}`;
    const est = estimate1RM(set.weight_lbs, set.reps);
    sessionBest.set(key, Math.max(sessionBest.get(key) ?? 0, est));
  }

  const byExercise = new Map<string, { before: number[]; inWindow: number[] }>();

  for (const [key, est] of sessionBest) {
    const pipe = key.indexOf("|");
    const name = key.slice(0, pipe);
    const date = key.slice(pipe + 1);
    let bucket = byExercise.get(name);
    if (!bucket) {
      bucket = { before: [], inWindow: [] };
      byExercise.set(name, bucket);
    }
    if (date >= periodStart) bucket.inWindow.push(est);
    else bucket.before.push(est);
  }

  const ratios: number[] = [];
  for (const bucket of byExercise.values()) {
    if (!bucket.before.length || !bucket.inWindow.length) continue;
    const a = bucket.before.reduce((s, v) => s + v, 0) / bucket.before.length;
    const b = bucket.inWindow.reduce((s, v) => s + v, 0) / bucket.inWindow.length;
    if (a <= 0) continue;
    ratios.push(b / a);
  }

  const strengthDelta = ratios.length
    ? ratios.reduce((s, r) => s + r, 0) / ratios.length - 1
    : 0;

  return { strengthDelta, exerciseCount: ratios.length };
}

/** Lifting signals for the composition estimate, from the server Hevy snapshot. */
export function liftSignalsFromSnapshot(
  snapshot: LiftingCompositionSnapshot | null,
  actualDays: number,
): CompositionLiftSignals {
  if (!snapshot || snapshot.workoutDates.length === 0) {
    return {
      strengthDelta: 0,
      sessionsPerWeek: 0,
      totalVolumeLbs: 0,
      workoutDayCount: 0,
      hasLiftData: false,
      liftSource: "Hevy",
      strengthExerciseCount: 0,
    };
  }
  const workoutDayCount = snapshot.workoutDates.length;
  return {
    strengthDelta: snapshot.strengthExerciseCount > 0 ? snapshot.strengthDelta : 0,
    sessionsPerWeek:
      snapshot.sessionsPerWeek > 0
        ? snapshot.sessionsPerWeek
        : actualDays > 0
          ? (workoutDayCount / actualDays) * 7
          : 0,
    totalVolumeLbs: snapshot.totalVolumeLbs,
    workoutDayCount,
    hasLiftData: true,
    liftSource: "Hevy",
    strengthExerciseCount: snapshot.strengthExerciseCount,
  };
}

export function computeCompositionEstimate(input: {
  weightDelta: number;
  actualDays: number;
  units: string;
  yearsTraining: number;
  lift: CompositionLiftSignals;
  usedRollingWeight?: boolean;
}): CompositionEstimate {
  const { weightDelta, actualDays, units, yearsTraining, lift } = input;
  const usedRollingWeight = input.usedRollingWeight ?? false;
  const weeks = actualDays / 7;

  const frequencyFactor = Math.max(
    0.4,
    Math.min(1.2, (lift.sessionsPerWeek || 0) / 4),
  );

  let maxMuscleKgPerWeek: number;
  if (yearsTraining <= 1) maxMuscleKgPerWeek = 0.45;
  else if (yearsTraining === 2) maxMuscleKgPerWeek = 0.23;
  else maxMuscleKgPerWeek = 0.11;

  const unitConv = units === "lb" ? 2.20462 : 1;
  const maxMusclePerWeek = maxMuscleKgPerWeek * unitConv * frequencyFactor;

  const strengthDelta = lift.strengthDelta;
  const { estMuscle, estFat } = partitionWeightChange(
    weightDelta,
    strengthDelta,
    lift.hasLiftData,
    weeks,
    maxMusclePerWeek,
  );

  let headlineCls: "good" | "warn" | "bad" | "" = "";
  let headline = "";
  const trendLabel = formatWeightDelta(units, weightDelta, usedRollingWeight);

  if (Math.abs(weightDelta) < 0.05) {
    headline = "Weight stable — keep logging and training.";
    headlineCls = "";
  } else if (weightDelta > 0) {
    if (strengthDelta >= 0.03) {
      headlineCls = "good";
      headline = `${trendLabel} — lifts up, likely lean gain.`;
    } else if (strengthDelta >= -0.015) {
      headlineCls = "warn";
      headline = `${trendLabel} — mixed gain. Push strength or trim kcal.`;
    } else if (lift.hasLiftData) {
      headlineCls = "bad";
      headline = `${trendLabel} — lifts down, likely mostly fat.`;
    } else {
      headlineCls = "warn";
      headline = `${trendLabel} — log workouts to refine this.`;
    }
  } else {
    const wDown = Math.abs(weightDelta);
    if (strengthDelta >= 0.02) {
      headlineCls = "good";
      headline = `${trendLabel} — strength holding/up, likely fat loss.`;
    } else if (strengthDelta >= -0.02) {
      headlineCls = "warn";
      headline = `−${wDown.toFixed(1)} ${units} — strength flat, mixed loss.`;
    } else if (lift.hasLiftData) {
      headlineCls = "warn";
      headline = `−${wDown.toFixed(1)} ${units} — lifts slipping, may be losing muscle.`;
    } else {
      headlineCls = "warn";
      headline = `−${wDown.toFixed(1)} ${units} — log workouts to see if muscle is at risk.`;
    }
  }

  const totalAbs = Math.abs(estMuscle) + Math.abs(estFat) || 1;
  const musclePct = (Math.abs(estMuscle) / totalAbs) * 100;
  const fatPct = (Math.abs(estFat) / totalAbs) * 100;

  const sd = strengthDelta * 100;
  const sdStr = `${sd >= 0 ? "+" : ""}${sd.toFixed(1)}%`;
  const muscleSign = estMuscle >= 0 ? "+" : "";
  const fatSign = estFat >= 0 ? "+" : "";
  const freqStr = `${lift.sessionsPerWeek.toFixed(1)} sessions/wk`;

  const liftingMeta = lift.hasLiftData
    ? `${lift.workoutDayCount} training days · ${lift.totalVolumeLbs.toLocaleString()} lb volume · est. 1RM ${sdStr} · ${lift.liftSource}`
    : "No lifting data in this window — log workouts in Hevy or Kova.";

  const footLine =
    `~${muscleSign}${estMuscle.toFixed(1)} ${units} muscle · ` +
    `~${fatSign}${estFat.toFixed(1)} ${units} fat · ` +
    `strength ${sdStr} · ${freqStr}` +
    (lift.hasLiftData ? "" : " (no lift data)") +
    (usedRollingWeight ? " · 7d avg weight trend" : "");

  return {
    headline,
    headlineCls,
    estMuscle,
    estFat,
    musclePct,
    fatPct,
    strengthDelta,
    sessionsPerWeek: lift.sessionsPerWeek,
    totalVolumeLbs: lift.totalVolumeLbs,
    actualDays,
    hasLiftData: lift.hasLiftData,
    liftSource: lift.liftSource,
    liftingMeta,
    footLine,
    usedRollingWeight,
  };
}

export function sumVolumeInWindow(
  sets: UnifiedWorkingSet[],
  periodStart: string,
): number {
  let total = 0;
  for (const set of sets) {
    if (set.date < periodStart || set.is_warmup) continue;
    total += setVolume(set.weight_lbs, set.reps);
  }
  return Math.round(total);
}
