/**
 * Hevy API integration (blueprint §2) — strength workouts.
 * Auth: static API key in the `api-key` header. Source-agnostic — no Supabase.
 */
import type { WorkoutExercise } from "@/types";

const HEVY_BASE = "https://api.hevyapp.com/v1";
const LB_PER_KG = 2.204_622_621_8;
const MAX_PAGE_SIZE = 10;

export interface HevySet {
  type?: string | null;
  weight_kg: number | null;
  reps: number | null;
}

export interface HevyExercise {
  title?: string | null;
  exercise_template_id?: string | null;
  notes?: string | null;
  sets?: HevySet[] | null;
}

export interface HevyWorkout {
  id: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  exercises: HevyExercise[];
}

export interface HevyWorkoutsPage {
  page: number;
  page_count: number;
  workouts: HevyWorkout[];
}

export type NormalizedHevyWorkout = {
  hevy_id: string;
  date: string;
  title: string | null;
  duration: number | null;
  volume_kg: number | null;
  exercises: WorkoutExercise[] | null;
};

function apiKey(): string {
  const key = process.env.HEVY_API_KEY?.trim();
  if (!key) {
    throw new Error("Hevy is not connected — set HEVY_API_KEY.");
  }
  return key;
}

function headers(key: string) {
  return {
    "api-key": key,
    Accept: "application/json",
  };
}

async function hevyFetch<T>(path: string, key = apiKey()): Promise<T> {
  const res = await fetch(`${HEVY_BASE}${path}`, { headers: headers(key) });
  if (!res.ok) {
    throw new Error(`Hevy ${path} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function isHevyConfigured(): boolean {
  return Boolean(process.env.HEVY_API_KEY?.trim());
}

export async function validateHevyApiKey(key: string): Promise<boolean> {
  try {
    await hevyFetch<{ workout_count: number }>("/workouts/count", key);
    return true;
  } catch {
    return false;
  }
}

export async function getWorkoutCount(key?: string): Promise<number> {
  const data = await hevyFetch<{ workout_count: number }>(
    "/workouts/count",
    key ?? apiKey(),
  );
  return data.workout_count;
}

/** Page through workout history. Hevy paginates 1-indexed; max 10 per page. */
export async function getWorkoutsPage(
  page = 1,
  pageSize = MAX_PAGE_SIZE,
  key?: string,
): Promise<HevyWorkoutsPage> {
  const size = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize));
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(size),
  });
  return hevyFetch<HevyWorkoutsPage>(`/workouts?${params}`, key ?? apiKey());
}

export function hevyWorkoutVolumeKg(exercises: HevyExercise[]): number {
  let volume = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets ?? []) {
      if (set.type === "warmup") continue;
      if (set.weight_kg == null || set.reps == null) continue;
      volume += set.weight_kg * set.reps;
    }
  }
  return Math.round(volume * 10) / 10;
}

export function hevyVolumeLbs(volumeKg: number | null): number | null {
  if (volumeKg == null) return null;
  return Math.round(volumeKg * LB_PER_KG);
}

export function normalizeHevyWorkout(
  workout: HevyWorkout,
  timezone: string,
): NormalizedHevyWorkout {
  const start = new Date(workout.start_time);
  const end = new Date(workout.end_time);
  const duration = Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
    ? Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000))
    : null;

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(start);

  const exercises: WorkoutExercise[] = (workout.exercises ?? []).map((ex) => ({
    name: ex.title?.trim() || "Exercise",
    sets: (ex.sets ?? []).map((set) => ({
      reps: set.reps ?? null,
      weight_kg: set.weight_kg ?? null,
    })),
  }));

  return {
    hevy_id: workout.id,
    date,
    title: workout.title?.trim() || null,
    duration,
    volume_kg: hevyWorkoutVolumeKg(workout.exercises ?? []),
    exercises,
  };
}

/**
 * Fetch workouts newest-first, stopping when older than `sinceIso` or pages
 * are exhausted. Caps page count to avoid runaway cron invocations.
 */
export async function fetchWorkoutsSince(
  sinceIso: string,
  maxPages = 50,
  key?: string,
): Promise<HevyWorkout[]> {
  const api = key ?? apiKey();
  const sinceMs = new Date(`${sinceIso}T00:00:00`).getTime();
  const collected: HevyWorkout[] = [];

  let page = 1;
  let pageCount = 1;

  while (page <= pageCount && page <= maxPages) {
    const batch = await getWorkoutsPage(page, MAX_PAGE_SIZE, api);
    pageCount = batch.page_count;
    if (batch.workouts.length === 0) break;

    let reachedCutoff = false;
    for (const workout of batch.workouts) {
      const startMs = new Date(workout.start_time).getTime();
      if (startMs < sinceMs) {
        reachedCutoff = true;
        break;
      }
      collected.push(workout);
    }

    if (reachedCutoff) break;
    page += 1;
  }

  return collected;
}
