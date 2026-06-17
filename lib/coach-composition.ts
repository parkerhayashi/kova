/**
 * Weight composition estimates — uses unified lifting data (Hevy + Kova)
 * and Coach logs as fallback.
 */
import { coachEstimate1RM } from "@/lib/coach-rx";
import type { CoachLog } from "@/lib/coach-rx";
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
  source: "hevy+kova" | "coach-logs";
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
};

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

export function buildLiftSignalsFromCoachLogs(
  logsByExercise: Record<string, CoachLog[]>,
  exercises: { id: string; bw?: boolean }[],
  periodStart: Date,
): CompositionLiftSignals {
  const workoutDays = new Set<string>();
  let totalVolumeLbs = 0;
  const strengthRatios: number[] = [];

  for (const ex of exercises) {
    const logs = (logsByExercise[ex.id] ?? []).slice();
    if (logs.length < 2 || ex.bw) {
      for (const log of logs) {
        if (new Date(log.date) >= periodStart) {
          workoutDays.add(log.date.slice(0, 10));
          totalVolumeLbs += (log.weight || 0) * (log.reps || 0);
        }
      }
      continue;
    }

    const inWin = logs.filter((l) => new Date(l.date) >= periodStart);
    const before = logs.filter((l) => new Date(l.date) < periodStart);
    for (const log of inWin) {
      workoutDays.add(log.date.slice(0, 10));
      totalVolumeLbs += (log.weight || 0) * (log.reps || 0);
    }
    if (!inWin.length || !before.length) continue;

    const avg = (arr: CoachLog[]) =>
      arr.reduce((s, l) => s + coachEstimate1RM(l.weight, l.reps), 0) / arr.length;
    const a = avg(before);
    const b = avg(inWin);
    if (a <= 0) continue;
    strengthRatios.push(b / a);
  }

  const strengthDelta = strengthRatios.length
    ? strengthRatios.reduce((s, r) => s + r, 0) / strengthRatios.length - 1
    : 0;

  return {
    strengthDelta,
    sessionsPerWeek: 0,
    totalVolumeLbs: Math.round(totalVolumeLbs),
    workoutDayCount: workoutDays.size,
    hasLiftData: workoutDays.size > 0 || strengthRatios.length > 0,
    liftSource: "Coach logs",
    strengthExerciseCount: strengthRatios.length,
  };
}

export function mergeLiftSignals(
  snapshot: LiftingCompositionSnapshot | null,
  coachSignals: CompositionLiftSignals,
  actualDays: number,
): CompositionLiftSignals {
  if (!snapshot || snapshot.workoutDates.length === 0) {
    return {
      ...coachSignals,
      sessionsPerWeek:
        actualDays > 0 ? (coachSignals.workoutDayCount / actualDays) * 7 : 0,
    };
  }

  const workoutDayCount = Math.max(
    snapshot.workoutDates.length,
    coachSignals.workoutDayCount,
  );
  const useSnapshotStrength = snapshot.strengthExerciseCount > 0;

  return {
    strengthDelta: useSnapshotStrength
      ? snapshot.strengthDelta
      : coachSignals.strengthDelta,
    sessionsPerWeek:
      snapshot.sessionsPerWeek > 0
        ? snapshot.sessionsPerWeek
        : actualDays > 0
          ? (workoutDayCount / actualDays) * 7
          : 0,
    totalVolumeLbs: Math.max(
      snapshot.totalVolumeLbs,
      coachSignals.totalVolumeLbs,
    ),
    workoutDayCount,
    hasLiftData: true,
    liftSource:
      snapshot.source === "hevy+kova" ? "Hevy + Kova" : coachSignals.liftSource,
    strengthExerciseCount: Math.max(
      snapshot.strengthExerciseCount,
      coachSignals.strengthExerciseCount,
    ),
  };
}

export function computeCompositionEstimate(input: {
  weightDelta: number;
  actualDays: number;
  units: string;
  yearsTraining: number;
  lift: CompositionLiftSignals;
}): CompositionEstimate {
  const { weightDelta, actualDays, units, yearsTraining, lift } = input;
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
  const maxMusclePerWeek = maxMuscleKgPerWeek * unitConv;

  const strengthDelta = lift.strengthDelta;
  const strengthBoost = Math.max(0.5, Math.min(1.5, 1 + strengthDelta * 4));
  let estMuscle = maxMusclePerWeek * weeks * strengthBoost * frequencyFactor;

  let estFat: number;
  let headlineCls: "good" | "warn" | "bad" | "" = "";
  let headline = "";

  if (weightDelta > 0) {
    estMuscle = Math.min(estMuscle, weightDelta);
    estFat = Math.max(0, weightDelta - estMuscle);
    const musclePct = estMuscle / weightDelta;
    if (musclePct >= 0.6 && strengthDelta > 0) {
      headlineCls = "good";
      headline = `+${weightDelta.toFixed(1)} ${units} — mostly muscle, strength up.`;
    } else if (musclePct >= 0.35) {
      headlineCls = "warn";
      headline = `+${weightDelta.toFixed(1)} ${units} — mixed. Tighten kcal or push lifts harder.`;
    } else {
      headlineCls = "bad";
      headline = `+${weightDelta.toFixed(1)} ${units} — mostly fat. Strength flat. Cut kcal.`;
    }
  } else {
    const wDown = Math.abs(weightDelta);
    if (strengthDelta >= 0) {
      estMuscle = Math.min(maxMusclePerWeek * weeks * 0.3, 0.5);
      estFat = wDown + estMuscle;
      headlineCls = "good";
      headline = `−${wDown.toFixed(1)} ${units} — strength holding, fat dropping.`;
    } else {
      const lossPct = Math.min(0.4, Math.abs(strengthDelta) * 2);
      estMuscle = -wDown * lossPct;
      estFat = -(wDown + estMuscle);
      headlineCls = "warn";
      headline = `−${wDown.toFixed(1)} ${units} — strength slipping. You may be losing muscle.`;
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
    ? `${lift.workoutDayCount} training days · ${lift.totalVolumeLbs.toLocaleString()} lb volume · strength ${sdStr} · ${lift.liftSource}`
    : "No lifting data in this window — log workouts in Hevy or Kova.";

  const footLine =
    `~${muscleSign}${estMuscle.toFixed(1)} ${units} muscle · ` +
    `~${fatSign}${estFat.toFixed(1)} ${units} fat · ` +
    `strength ${sdStr} · ${freqStr}` +
    (lift.hasLiftData ? "" : " (no lift data)");

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
