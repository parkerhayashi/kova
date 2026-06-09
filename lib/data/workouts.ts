import { createServiceClient } from "@/lib/supabase/server";
import { estimateRoutineMinutes } from "@/lib/workouts";
import { todayInTimezone } from "@/lib/utils";
import { getTimezone } from "@/lib/data/oura";
import type {
  ActiveWorkoutView,
  Exercise,
  RoutineDetail,
  RoutineExerciseView,
  SessionExerciseView,
  WorkoutRoutine,
  WorkoutSession,
  WorkoutSet,
} from "@/types";

type DbExercise = Exercise;

function mapRoutineExercise(
  row: {
    id: string;
    position: number;
    target_sets: number;
    rep_min: number | null;
    rep_max: number | null;
    rest_seconds: number;
    notes: string | null;
    exercises: DbExercise | DbExercise[] | null;
  },
): RoutineExerciseView {
  const exercise = Array.isArray(row.exercises)
    ? row.exercises[0]
    : row.exercises;
  if (!exercise) throw new Error("Exercise missing on routine row");
  return {
    id: row.id,
    position: row.position,
    target_sets: row.target_sets,
    rep_min: row.rep_min,
    rep_max: row.rep_max,
    rest_seconds: row.rest_seconds,
    notes: row.notes,
    exercise,
  };
}

export async function listRoutines(): Promise<WorkoutRoutine[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("workout_routines")
    .select("*")
    .order("sort_order", { ascending: true });
  return (data as WorkoutRoutine[]) ?? [];
}

export async function getRoutineDetail(
  routineId: string,
): Promise<RoutineDetail | null> {
  const db = createServiceClient();
  const { data: routine } = await db
    .from("workout_routines")
    .select("*")
    .eq("id", routineId)
    .maybeSingle();
  if (!routine) return null;

  const { data: rows } = await db
    .from("workout_routine_exercises")
    .select(
      "id, position, target_sets, rep_min, rep_max, rest_seconds, notes, exercises (*)",
    )
    .eq("routine_id", routineId)
    .order("position", { ascending: true });

  const exercises = (rows ?? []).map((row) =>
    mapRoutineExercise(
      row as Parameters<typeof mapRoutineExercise>[0],
    ),
  );
  const total_sets = exercises.reduce((n, ex) => n + ex.target_sets, 0);
  const avgRest =
    exercises.length > 0
      ? Math.round(
          exercises.reduce((n, ex) => n + ex.rest_seconds, 0) /
            exercises.length,
        )
      : 180;

  return {
    ...(routine as WorkoutRoutine),
    exercises,
    total_sets,
    estimated_minutes: estimateRoutineMinutes(
      exercises.length,
      total_sets,
      avgRest,
    ),
  };
}

export async function getActiveSession(): Promise<WorkoutSession | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("workout_sessions")
    .select("*")
    .eq("status", "in_progress")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as WorkoutSession) ?? null;
}

async function loadSessionExercises(
  sessionId: string,
): Promise<SessionExerciseView[]> {
  const db = createServiceClient();
  const { data: rows } = await db
    .from("workout_session_exercises")
    .select(
      "id, position, target_sets, rep_min, rep_max, rest_seconds, notes, exercises (*)",
    )
    .eq("session_id", sessionId)
    .order("position", { ascending: true });

  const { data: sets } = await db
    .from("workout_sets")
    .select("*")
    .eq("session_id", sessionId)
    .order("position", { ascending: true })
    .order("set_index", { ascending: true });

  const setsByKey = new Map<string, WorkoutSet[]>();
  for (const set of (sets as WorkoutSet[]) ?? []) {
    const key = `${set.position}:${set.exercise_id}`;
    const list = setsByKey.get(key) ?? [];
    list.push(set);
    setsByKey.set(key, list);
  }

  return (rows ?? []).map((row) => {
    const base = mapRoutineExercise(
      row as Parameters<typeof mapRoutineExercise>[0],
    );
    const key = `${base.position}:${base.exercise.id}`;
    return {
      ...base,
      session_exercise_id: (row as { id: string }).id,
      sets: setsByKey.get(key) ?? [],
    };
  });
}

export async function getActiveWorkout(
  sessionId: string,
): Promise<ActiveWorkoutView | null> {
  const db = createServiceClient();
  const { data: session } = await db
    .from("workout_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return null;

  const exercises = await loadSessionExercises(sessionId);
  let total_volume_lbs = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (set.completed && set.weight_lbs != null && set.reps != null) {
        total_volume_lbs += set.weight_lbs * set.reps;
      }
    }
  }

  return {
    session: session as WorkoutSession,
    exercises,
    total_volume_lbs: Math.round(total_volume_lbs),
  };
}

export async function startSessionFromRoutine(
  routineId: string,
): Promise<ActiveWorkoutView> {
  const existing = await getActiveSession();
  if (existing) {
    const workout = await getActiveWorkout(existing.id);
    if (workout) return workout;
  }

  const routine = await getRoutineDetail(routineId);
  if (!routine) throw new Error("Routine not found");

  const timezone = await getTimezone();
  const date = todayInTimezone(timezone);
  const db = createServiceClient();

  const { data: session, error: sessionError } = await db
    .from("workout_sessions")
    .insert({
      date,
      title: routine.name,
      routine_id: routineId,
      status: "in_progress",
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (sessionError || !session) {
    throw new Error(sessionError?.message ?? "Failed to start session");
  }

  if (routine.exercises.length > 0) {
    const { error: exError } = await db.from("workout_session_exercises").insert(
      routine.exercises.map((ex) => ({
        session_id: session.id,
        exercise_id: ex.exercise.id,
        position: ex.position,
        target_sets: ex.target_sets,
        rep_min: ex.rep_min,
        rep_max: ex.rep_max,
        rest_seconds: ex.rest_seconds,
        notes: ex.notes,
      })),
    );
    if (exError) throw new Error(exError.message);
  }

  const workout = await getActiveWorkout(session.id);
  if (!workout) throw new Error("Failed to load new session");
  return workout;
}

export async function upsertWorkoutSet(input: {
  session_id: string;
  session_exercise_id: string;
  set_index: number;
  weight_lbs?: number | null;
  reps?: number | null;
  completed?: boolean;
}): Promise<WorkoutSet> {
  const db = createServiceClient();
  const { data: sessionEx } = await db
    .from("workout_session_exercises")
    .select("exercise_id, position, session_id")
    .eq("id", input.session_exercise_id)
    .maybeSingle();
  if (!sessionEx || sessionEx.session_id !== input.session_id) {
    throw new Error("Session exercise not found");
  }

  const { data: existing } = await db
    .from("workout_sets")
    .select("id")
    .eq("session_id", input.session_id)
    .eq("exercise_id", sessionEx.exercise_id)
    .eq("position", sessionEx.position)
    .eq("set_index", input.set_index)
    .maybeSingle();

  const payload = {
    session_id: input.session_id,
    exercise_id: sessionEx.exercise_id,
    position: sessionEx.position,
    set_index: input.set_index,
    weight_lbs: input.weight_lbs ?? null,
    reps: input.reps ?? null,
    completed: input.completed ?? true,
  };

  if (existing) {
    const { data, error } = await db
      .from("workout_sets")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Update failed");
    return data as WorkoutSet;
  }

  const { data, error } = await db
    .from("workout_sets")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Insert failed");
  return data as WorkoutSet;
}

export async function reorderSessionExercises(
  sessionId: string,
  orderedIds: string[],
): Promise<void> {
  const db = createServiceClient();
  const { data: rows } = await db
    .from("workout_session_exercises")
    .select("id, exercise_id, position")
    .eq("session_id", sessionId);

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i];
    const row = rows?.find((r) => r.id === id);
    if (!row) continue;
    const oldPos = row.position;

    await db
      .from("workout_session_exercises")
      .update({ position: i })
      .eq("id", id);

    if (oldPos !== i) {
      await db
        .from("workout_sets")
        .update({ position: i })
        .eq("session_id", sessionId)
        .eq("exercise_id", row.exercise_id)
        .eq("position", oldPos);
    }
  }
}

export async function replaceSessionExercise(
  sessionExerciseId: string,
  newExerciseId: string,
): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("workout_session_exercises")
    .select("session_id, position, exercise_id")
    .eq("id", sessionExerciseId)
    .maybeSingle();
  if (!row) throw new Error("Session exercise not found");

  await db
    .from("workout_session_exercises")
    .update({ exercise_id: newExerciseId })
    .eq("id", sessionExerciseId);

  await db
    .from("workout_sets")
    .delete()
    .eq("session_id", row.session_id)
    .eq("exercise_id", row.exercise_id)
    .eq("position", row.position);
}

export async function completeSession(sessionId: string): Promise<WorkoutSession> {
  const db = createServiceClient();
  const { data: session } = await db
    .from("workout_sessions")
    .select("started_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) throw new Error("Session not found");

  const startedAt = session.started_at
    ? new Date(session.started_at).getTime()
    : Date.now();
  const duration = Math.max(0, Math.round((Date.now() - startedAt) / 1000));

  const { data, error } = await db
    .from("workout_sessions")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      duration,
    })
    .eq("id", sessionId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Complete failed");
  return data as WorkoutSession;
}

export async function cancelSession(sessionId: string): Promise<void> {
  const db = createServiceClient();
  await db.from("workout_sessions").delete().eq("id", sessionId);
}

export async function searchExercises(query: string): Promise<Exercise[]> {
  const db = createServiceClient();
  const q = query.trim();
  let builder = db
    .from("exercises")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(30);
  if (q) {
    builder = builder.ilike("name", `%${q}%`);
  }
  const { data } = await builder;
  return (data as Exercise[]) ?? [];
}

export async function listRecentSessions(limit = 10): Promise<WorkoutSession[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("workout_sessions")
    .select("*")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(limit);
  return (data as WorkoutSession[]) ?? [];
}
