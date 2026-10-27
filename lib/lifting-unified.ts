/**
 * Helpers to flatten Hevy imports into working sets for lifting stats.
 * Client-safe — no server imports.
 */
import { setVolume, type WorkingSet } from "@/lib/workouts";
import type { Workout } from "@/types";

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

/**
 * First match wins, so specific movements come before the generic keywords
 * they contain: "Leg Curl" must hit legs before arms' `curl`, "Lateral Raise"
 * and "Rear Delt Fly" must hit shoulders before back's `lat` / chest's `fly`.
 */
const CATEGORY_PATTERNS: [RegExp, string][] = [
  [/leg curl|leg extension|leg press|squat|lunge|hip thrust|glute|hamstring|romanian|\brdl\b|stiff.?leg|calve|calf|adductor|abductor/i, "legs"],
  [/lateral raise|rear delt|reverse fly|face pull|shoulder|\bohp\b|overhead press|military press|upright row|delt|arnold/i, "shoulders"],
  [/curl|tricep|bicep|preacher|hammer|skull|pushdown|jm press/i, "arms"],
  [/bench|fly|flye|pec|push.?up|chest press|chest dip|crossover/i, "chest"],
  [/row|pull.?up|chin.?up|\blats?\b|pulldown|pullover|deadlift|back extension|good morning|shrug|traction/i, "back"],
  [/crunch|\babs?\b|ab wheel|core|plank|sit.?up|twist|leg raise|knee raise/i, "core"],
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
  source: "hevy";
};

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
