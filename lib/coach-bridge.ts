/**
 * Client bridge between Train (Supabase sessions) and Coach (localStorage).
 */

import { scheduleClientSyncPush } from "@/lib/client-sync";
import type { HevyCoachWorkoutLog } from "@/lib/lifting-unified";
import {
  coachEstimate1RM,
  getCoachPrescription,
  type CoachExercise,
  type CoachLog,
  type CoachPrescription,
  getTodaySplit,
} from "@/lib/coach-rx";
import type { ActiveWorkoutView, SessionExerciseView } from "@/types";

const LS_KEY = "po_coach_v1";
const WORKOUT_DONE_KEY = "po_coach_workout_done";
const HEVY_SYNCED_KEY = "po_coach_hevy_synced";

export type CoachState = {
  units: string;
  gyms: { id: string; name: string }[];
  days: { id: string; name: string }[];
  exercises: CoachExercise[];
  logs: Record<string, CoachLog[]>;
  filterGym: string;
  filterDay: string;
  splitRotation: string[];
  splitAnchor: { date: string; index: number };
};

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function loadCoachState(): CoachState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CoachState;
  } catch {
    return null;
  }
}

export function saveCoachState(state: CoachState): void {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
  scheduleClientSyncPush("coach");
}

function dayIdFromRoutineTitle(title: string, state: CoachState): string {
  const t = title.toLowerCase();
  const match = state.days.find(
    (d) => d.name.toLowerCase() === t || d.id.toLowerCase() === t,
  );
  return match?.id ?? t;
}

export function findCoachExercise(
  state: CoachState,
  trainExerciseName: string,
  dayId: string,
): CoachExercise | null {
  const normalized = normalizeName(trainExerciseName);
  const candidates = state.exercises.filter((e) => e.day === dayId);

  let match = candidates.find((e) => normalizeName(e.name) === normalized);
  if (match) return match;

  match = candidates.find((e) => {
    const en = normalizeName(e.name);
    return normalized.includes(en) || en.includes(normalized);
  });
  if (match) return match;

  // Fall back to any day if only one name match exists
  const anyDay = state.exercises.find((e) => normalizeName(e.name) === normalized);
  return anyDay ?? null;
}

function ensureCoachExercise(
  state: CoachState,
  trainName: string,
  dayId: string,
  repMin: number | null,
  repMax: number | null,
): CoachExercise {
  const existing = findCoachExercise(state, trainName, dayId);
  if (existing) return existing;

  const ex: CoachExercise = {
    id: `ex_${Date.now()}_${Math.floor(Math.random() * 9999)}`,
    name: trainName,
    gym: state.filterGym || "comm",
    day: dayId,
    repMin: repMin ?? 5,
    repMax: repMax ?? 8,
    step: 5,
    startWeight: 0,
  };
  state.exercises.push(ex);
  return ex;
}

export function getPrescriptionForTrainExercise(
  exercise: SessionExerciseView,
  routineTitle: string | null,
): CoachPrescription | null {
  const state = loadCoachState();
  if (!state || !routineTitle) return null;

  const dayId = dayIdFromRoutineTitle(routineTitle, state);
  const coachEx = findCoachExercise(state, exercise.exercise.name, dayId);
  if (!coachEx) return null;

  const logs = state.logs[coachEx.id] ?? [];
  return getCoachPrescription(coachEx, logs);
}

export function getSuggestedWeight(
  exercise: SessionExerciseView,
  routineTitle: string | null,
): number | null {
  const rx = getPrescriptionForTrainExercise(exercise, routineTitle);
  if (rx && !rx.bw && rx.weight > 0) return rx.weight;

  const state = loadCoachState();
  if (!state || !routineTitle) return null;
  const dayId = dayIdFromRoutineTitle(routineTitle, state);
  const coachEx = findCoachExercise(state, exercise.exercise.name, dayId);
  if (!coachEx) return null;

  const logs = state.logs[coachEx.id] ?? [];
  if (logs.length) return logs[logs.length - 1].weight;
  return coachEx.startWeight > 0 ? coachEx.startWeight : null;
}

function bestWorkingSet(exercise: SessionExerciseView) {
  const working = exercise.sets.filter(
    (s) =>
      s.completed &&
      !s.is_warmup &&
      s.weight_lbs != null &&
      s.reps != null &&
      s.weight_lbs > 0 &&
      s.reps > 0,
  );
  if (!working.length) return null;
  return working.reduce((best, set) => {
    const bestEst = coachEstimate1RM(best.weight_lbs!, best.reps!);
    const setEst = coachEstimate1RM(set.weight_lbs!, set.reps!);
    return setEst >= bestEst ? set : best;
  });
}

/** Push completed Train session top sets into Coach logs. */
export function syncSessionToCoach(workout: ActiveWorkoutView): number {
  const state = loadCoachState();
  if (!state) return 0;

  const title = workout.session.title ?? "";
  const dayId = dayIdFromRoutineTitle(title, state);
  const now = new Date().toISOString();
  let synced = 0;

  for (const ex of workout.exercises) {
    const best = bestWorkingSet(ex);
    if (!best) continue;

    const coachEx = ensureCoachExercise(
      state,
      ex.exercise.name,
      dayId,
      ex.rep_min,
      ex.rep_max,
    );

    const arr = state.logs[coachEx.id] ?? [];
    arr.push({
      date: now,
      weight: best.weight_lbs!,
      reps: best.reps!,
    });
    state.logs[coachEx.id] = arr;
    synced += 1;
  }

  if (synced > 0) {
    const todayKey = now.slice(0, 10);
    try {
      const raw = localStorage.getItem(WORKOUT_DONE_KEY);
      const done = raw ? (JSON.parse(raw) as Record<string, string>) : {};
      done[todayKey] = now;
      localStorage.setItem(WORKOUT_DONE_KEY, JSON.stringify(done));
    } catch {
      /* ignore */
    }
    saveCoachState(state);
  }

  return synced;
}

function loadSyncedHevyIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(HEVY_SYNCED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSyncedHevyIds(ids: Set<string>): void {
  localStorage.setItem(HEVY_SYNCED_KEY, JSON.stringify([...ids]));
}

function coachLogExists(
  logs: CoachLog[],
  date: string,
  weight: number,
  reps: number,
): boolean {
  return logs.some(
    (log) =>
      log.date.slice(0, 10) === date &&
      log.weight === weight &&
      log.reps === reps,
  );
}

/** Import Hevy top sets into Coach logs (incremental by hevy_id). */
export function syncHevyWorkoutsToCoach(workouts: HevyCoachWorkoutLog[]): number {
  const state = loadCoachState();
  if (!state || workouts.length === 0) return 0;

  const syncedIds = loadSyncedHevyIds();
  let imported = 0;

  for (const workout of workouts) {
    if (syncedIds.has(workout.hevy_id)) continue;

    const dayId = dayIdFromRoutineTitle(workout.title ?? "", state);
    const logDate = `${workout.date}T12:00:00.000Z`;
    let addedForWorkout = 0;

    for (const exercise of workout.exercises) {
      const coachEx = ensureCoachExercise(
        state,
        exercise.name,
        dayId,
        exercise.reps,
        exercise.reps,
      );

      const arr = state.logs[coachEx.id] ?? [];
      if (
        coachLogExists(arr, workout.date, exercise.weight_lbs, exercise.reps)
      ) {
        continue;
      }

      arr.push({
        date: logDate,
        weight: exercise.weight_lbs,
        reps: exercise.reps,
      });
      state.logs[coachEx.id] = arr;
      addedForWorkout += 1;
      imported += 1;
    }

    if (addedForWorkout > 0) {
      syncedIds.add(workout.hevy_id);
      try {
        const raw = localStorage.getItem(WORKOUT_DONE_KEY);
        const done = raw ? (JSON.parse(raw) as Record<string, string>) : {};
        done[workout.date] = logDate;
        localStorage.setItem(WORKOUT_DONE_KEY, JSON.stringify(done));
      } catch {
        /* ignore */
      }
    }
  }

  if (imported > 0) {
    saveSyncedHevyIds(syncedIds);
    saveCoachState(state);
  }

  return imported;
}

export function readTodaySplit(): ReturnType<typeof getTodaySplit> | null {
  const state = loadCoachState();
  if (!state) return null;
  return getTodaySplit(state);
}

export function formatCoachTarget(rx: CoachPrescription): string {
  if (rx.bw) return `${rx.reps} reps`;
  return `${rx.weight} lb × ${rx.reps}`;
}

export function routineNameMatchesSplit(
  routineName: string,
  splitName: string,
): boolean {
  return routineName.toLowerCase() === splitName.toLowerCase();
}
