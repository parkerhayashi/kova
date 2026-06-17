/**
 * Shared helpers to treat Hevy imports and native Kova sets uniformly.
 * Client-safe — no server imports.
 */
import { estimate1RM, setVolume, type WorkingSet } from "@/lib/workouts";
import type { Workout, WorkoutExercise } from "@/types";

export const KG_TO_LB = 2.204_622_621_8;

export function hevyWeightToLbs(weightKg: number | null | undefined): number | null {
  if (weightKg == null) return null;
  return Math.round(weightKg * KG_TO_LB * 10) / 10;
}

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/curl|tricep|bicep|preacher|hammer|skull/i, "arms"],
  [/bench|fly|pec|push.?up|chest press/i, "chest"],
  [/row|pull.?up|lat|pulldown|deadlift|back extension|good morning/i, "back"],
  [/squat|leg press|lunge|split squat|hip thrust|glute|ham|calve|calf|leg curl|leg extension/i, "legs"],
  [/shoulder|ohp|overhead|lateral raise|face pull|delts|arnold/i, "shoulders"],
  [/crunch|ab|core|plank|sit.?up|twist/i, "core"],
];

/** Keyword fallback when an exercise isn't in the Kova catalog. */
export function inferExerciseCategory(name: string): string {
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(name)) return category;
  }
  return "other";
}

export type UnifiedWorkingSet = WorkingSet & {
  session_id: string;
  date: string;
  exercise_name: string;
  exercise_category: string;
  source: "native" | "hevy";
};

export type HevyCoachExerciseLog = {
  name: string;
  weight_lbs: number;
  reps: number;
};

export type HevyCoachWorkoutLog = {
  hevy_id: string;
  date: string;
  title: string | null;
  exercises: HevyCoachExerciseLog[];
};

export function exerciseNamesMatch(a: string, b: string): boolean {
  const na = normalizeExerciseName(a);
  const nb = normalizeExerciseName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return na.includes(nb) || nb.includes(na);
}

export function resolveExerciseCategory(
  name: string,
  catalog: Map<string, string>,
): string {
  const normalized = normalizeExerciseName(name);
  const direct = catalog.get(normalized);
  if (direct) return direct;

  for (const [key, category] of catalog) {
    if (normalized.includes(key) || key.includes(normalized)) return category;
  }

  return inferExerciseCategory(name);
}

function isWorkingHevySet(
  set: WorkoutExercise["sets"][number],
): boolean {
  if (set.is_warmup) return false;
  if (set.reps == null || set.reps <= 0) return false;
  if (set.weight_kg != null && set.weight_kg <= 0) return false;
  return true;
}

export function bestSetFromHevyExercise(
  exercise: WorkoutExercise,
): { weight_lbs: number; reps: number } | null {
  let best: { weight_lbs: number; reps: number; est: number } | null = null;

  for (const set of exercise.sets ?? []) {
    if (!isWorkingHevySet(set)) continue;
    const weight_lbs = hevyWeightToLbs(set.weight_kg) ?? 0;
    const reps = set.reps ?? 0;
    const est =
      weight_lbs > 0 ? estimate1RM(weight_lbs, reps) : reps;
    if (!best || est >= best.est) {
      best = { weight_lbs, reps, est };
    }
  }

  if (!best) return null;
  return { weight_lbs: best.weight_lbs, reps: best.reps };
}

export function flattenHevyWorkout(
  workout: Pick<Workout, "hevy_id" | "date" | "title" | "exercises">,
  catalog: Map<string, string> = new Map(),
): UnifiedWorkingSet[] {
  if (!workout.date || !workout.exercises?.length) return [];

  const rows: UnifiedWorkingSet[] = [];
  const sessionId = `hevy:${workout.hevy_id}`;

  for (const exercise of workout.exercises) {
    const category = resolveExerciseCategory(exercise.name, catalog);
    for (const set of exercise.sets ?? []) {
      const weight_lbs = hevyWeightToLbs(set.weight_kg);
      const reps = set.reps;
      const is_warmup = set.is_warmup === true;
      const isBodyweight = weight_lbs == null && reps != null && reps > 0;

      if (is_warmup) continue;
      if (reps == null || reps <= 0) continue;
      if (!isBodyweight && (weight_lbs == null || weight_lbs <= 0)) continue;

      rows.push({
        weight_lbs: weight_lbs ?? 0,
        reps,
        is_warmup: false,
        completed: true,
        session_id: sessionId,
        date: workout.date,
        exercise_name: exercise.name,
        exercise_category: category,
        source: "hevy",
      });
    }
  }

  return rows;
}

export function flattenHevyWorkouts(
  workouts: Workout[],
  catalog: Map<string, string> = new Map(),
): UnifiedWorkingSet[] {
  return workouts.flatMap((workout) => flattenHevyWorkout(workout, catalog));
}

export function toHevyCoachWorkoutLog(
  workout: Pick<Workout, "hevy_id" | "date" | "title" | "exercises">,
): HevyCoachWorkoutLog | null {
  if (!workout.date || !workout.exercises?.length) return null;

  const exercises: HevyCoachExerciseLog[] = [];
  for (const exercise of workout.exercises) {
    const best = bestSetFromHevyExercise(exercise);
    if (!best) continue;
    exercises.push({ name: exercise.name, ...best });
  }

  if (exercises.length === 0) return null;
  return {
    hevy_id: workout.hevy_id,
    date: workout.date,
    title: workout.title,
    exercises,
  };
}

export function aggregateVolumeByDay(
  sets: UnifiedWorkingSet[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const set of sets) {
    if (set.is_warmup) continue;
    const vol = setVolume(set.weight_lbs, set.reps);
    if (vol <= 0) continue;
    map.set(set.date, (map.get(set.date) ?? 0) + vol);
  }
  return map;
}

export function aggregateMuscleSplit(
  sets: UnifiedWorkingSet[],
): { category: string; sets: number; volume_lbs: number }[] {
  const muscleSets = new Map<string, number>();
  const muscleVolume = new Map<string, number>();

  for (const set of sets) {
    if (set.is_warmup) continue;
    const vol = setVolume(set.weight_lbs, set.reps);
    if (vol <= 0) continue;
    const cat = set.exercise_category ?? "other";
    muscleSets.set(cat, (muscleSets.get(cat) ?? 0) + 1);
    muscleVolume.set(cat, (muscleVolume.get(cat) ?? 0) + vol);
  }

  return [...muscleSets.entries()]
    .map(([category, setCount]) => ({
      category,
      sets: setCount,
      volume_lbs: Math.round(muscleVolume.get(category) ?? 0),
    }))
    .sort((a, b) => b.sets - a.sets);
}
