"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getTimezone } from "@/lib/data/oura";
import {
  addExercise,
  addExerciseToSession,
  addSet,
  createSession,
  deleteSession,
  deleteSet,
  removeExerciseFromSession,
  updateSession,
  updateSet,
} from "@/lib/data/workouts";
import { todayInTimezone } from "@/lib/utils";
import type { Exercise, WorkoutSet } from "@/types";

/** Start a new session dated today (user's zone) and open its editor. */
export async function newWorkout(): Promise<void> {
  const timezone = await getTimezone();
  const id = await createSession({ date: todayInTimezone(timezone), title: null });
  if (!id) throw new Error("Could not create workout session.");
  revalidatePath("/workouts");
  redirect(`/workouts/${id}`);
}

export async function updateSessionAction(
  id: string,
  fields: { title?: string | null; notes?: string | null; date?: string },
): Promise<void> {
  await updateSession(id, fields);
  revalidatePath("/workouts");
  revalidatePath("/");
}

export async function deleteSessionAction(id: string): Promise<void> {
  await deleteSession(id);
  revalidatePath("/workouts");
  revalidatePath("/");
  redirect("/workouts");
}

export async function createExerciseAction(input: {
  name: string;
  category: string | null;
  equipment: string | null;
}): Promise<Exercise | null> {
  if (!input.name.trim()) return null;
  return addExercise(input);
}

export async function addExerciseToSessionAction(
  sessionId: string,
  exerciseId: string,
): Promise<WorkoutSet | null> {
  return addExerciseToSession(sessionId, exerciseId);
}

export async function addSetAction(input: {
  session_id: string;
  exercise_id: string;
  position: number;
  set_index: number;
  weight_lbs: number | null;
  reps: number | null;
}): Promise<WorkoutSet | null> {
  return addSet(input);
}

export async function updateSetAction(
  id: string,
  fields: {
    weight_lbs?: number | null;
    reps?: number | null;
    rpe?: number | null;
    is_warmup?: boolean;
    completed?: boolean;
  },
): Promise<void> {
  await updateSet(id, fields);
}

export async function deleteSetAction(id: string): Promise<void> {
  await deleteSet(id);
}

export async function removeExerciseAction(
  sessionId: string,
  exerciseId: string,
): Promise<void> {
  await removeExerciseFromSession(sessionId, exerciseId);
}
