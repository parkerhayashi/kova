import { createServiceClient } from "@/lib/supabase/server";
import {
  dedupeCatalogItems,
  fetchExerciseDbById,
  searchExerciseDbByName,
  toCatalogItem,
  toExerciseFields,
} from "@/lib/exercisedb";
import {
  computeExerciseStats,
  estimate1RM,
  estimateRoutineMinutes,
  setVolume,
} from "@/lib/workouts";
import { addDays, todayInTimezone } from "@/lib/utils";
import { getTimezone } from "@/lib/data/oura";
import type {
  ActiveWorkoutView,
  Exercise,
  ExerciseCatalogItem,
  ExerciseHistorySession,
  ExerciseSearchResult,
  ExerciseStats,
  LiftingDashboard,
  RoutineDetail,
  RoutineExerciseView,
  SessionExerciseView,
  WorkoutRoutine,
  WorkoutSession,
  WorkoutSet,
  WorkoutTodaySummary,
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

export async function updateRoutineName(
  routineId: string,
  name: string,
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Routine name is required");
  const db = createServiceClient();
  const { error } = await db
    .from("workout_routines")
    .update({ name: trimmed })
    .eq("id", routineId);
  if (error) throw new Error(error.message);
}

export async function reorderRoutineExercises(
  routineId: string,
  orderedIds: string[],
): Promise<void> {
  const db = createServiceClient();
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await db
      .from("workout_routine_exercises")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("routine_id", routineId);
    if (error) throw new Error(error.message);
  }
}

export async function addRoutineExercise(
  routineId: string,
  exerciseId: string,
): Promise<void> {
  const db = createServiceClient();
  const { data: last } = await db
    .from("workout_routine_exercises")
    .select("position")
    .eq("routine_id", routineId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (last?.position ?? -1) + 1;
  const { error } = await db.from("workout_routine_exercises").insert({
    routine_id: routineId,
    exercise_id: exerciseId,
    position,
    target_sets: 3,
    rest_seconds: 180,
  });
  if (error) throw new Error(error.message);
}

export async function updateRoutineExercise(
  routineExerciseId: string,
  patch: {
    notes?: string | null;
    rest_seconds?: number;
    target_sets?: number;
    rep_min?: number | null;
    rep_max?: number | null;
  },
): Promise<void> {
  const db = createServiceClient();
  const payload: Record<string, unknown> = {};
  if ("notes" in patch) payload.notes = patch.notes;
  if (patch.rest_seconds != null) payload.rest_seconds = patch.rest_seconds;
  if (patch.target_sets != null) payload.target_sets = patch.target_sets;
  if ("rep_min" in patch) payload.rep_min = patch.rep_min;
  if ("rep_max" in patch) payload.rep_max = patch.rep_max;
  if (Object.keys(payload).length === 0) return;

  const { error } = await db
    .from("workout_routine_exercises")
    .update(payload)
    .eq("id", routineExerciseId);
  if (error) throw new Error(error.message);
}

export async function removeRoutineExercise(routineExerciseId: string): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("workout_routine_exercises")
    .select("routine_id")
    .eq("id", routineExerciseId)
    .maybeSingle();
  if (!row) throw new Error("Routine exercise not found");

  await db.from("workout_routine_exercises").delete().eq("id", routineExerciseId);

  const { data: remaining } = await db
    .from("workout_routine_exercises")
    .select("id")
    .eq("routine_id", row.routine_id)
    .order("position", { ascending: true });

  if (remaining && remaining.length > 0) {
    await reorderRoutineExercises(
      row.routine_id,
      remaining.map((r) => r.id),
    );
  }
}

export async function replaceRoutineExercise(
  routineExerciseId: string,
  newExerciseId: string,
): Promise<void> {
  const db = createServiceClient();
  const { error } = await db
    .from("workout_routine_exercises")
    .update({ exercise_id: newExerciseId })
    .eq("id", routineExerciseId);
  if (error) throw new Error(error.message);
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

export async function addSessionExercise(
  sessionId: string,
  exerciseId: string,
): Promise<void> {
  const db = createServiceClient();
  const { data: last } = await db
    .from("workout_session_exercises")
    .select("position")
    .eq("session_id", sessionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (last?.position ?? -1) + 1;
  const { error } = await db.from("workout_session_exercises").insert({
    session_id: sessionId,
    exercise_id: exerciseId,
    position,
    target_sets: 3,
    rest_seconds: 180,
  });
  if (error) throw new Error(error.message);
}

export async function updateSessionExercise(
  sessionExerciseId: string,
  patch: { notes?: string | null; rest_seconds?: number; target_sets?: number },
): Promise<void> {
  const db = createServiceClient();
  const payload: Record<string, unknown> = {};
  if ("notes" in patch) payload.notes = patch.notes;
  if (patch.rest_seconds != null) payload.rest_seconds = patch.rest_seconds;
  if (patch.target_sets != null) payload.target_sets = patch.target_sets;
  if (Object.keys(payload).length === 0) return;

  const { error } = await db
    .from("workout_session_exercises")
    .update(payload)
    .eq("id", sessionExerciseId);
  if (error) throw new Error(error.message);
}

export async function removeSessionExercise(sessionExerciseId: string): Promise<void> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("workout_session_exercises")
    .select("session_id, position, exercise_id")
    .eq("id", sessionExerciseId)
    .maybeSingle();
  if (!row) throw new Error("Session exercise not found");

  await db
    .from("workout_sets")
    .delete()
    .eq("session_id", row.session_id)
    .eq("exercise_id", row.exercise_id)
    .eq("position", row.position);

  await db.from("workout_session_exercises").delete().eq("id", sessionExerciseId);

  const { data: remaining } = await db
    .from("workout_session_exercises")
    .select("id")
    .eq("session_id", row.session_id)
    .order("position", { ascending: true });

  if (remaining && remaining.length > 0) {
    await reorderSessionExercises(
      row.session_id,
      remaining.map((r) => r.id),
    );
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
  const result = await searchExerciseLibrary(query);
  return result.local;
}

function mapCatalogRow(row: Record<string, unknown>): ExerciseCatalogItem {
  return {
    exercisedb_id: row.exercisedb_id as string,
    name: row.name as string,
    gif_url: row.gif_url as string,
    body_part: (row.body_part as string | null) ?? null,
    equipment: (row.equipment as string | null) ?? null,
    target_muscle: (row.target_muscle as string | null) ?? null,
    secondary_muscles: (row.secondary_muscles as string[]) ?? [],
    instructions: (row.instructions as string[]) ?? [],
    category: (row.category as string | null) ?? null,
  };
}

function mapExerciseRow(row: Record<string, unknown>): Exercise {
  const base = row as unknown as Exercise;
  return {
    ...base,
    secondary_muscles: (row.secondary_muscles as string[] | null) ?? null,
    instructions: (row.instructions as string[] | null) ?? null,
  };
}

/** Local library + ExerciseDB catalog matches (catalog excludes already-imported). */
export async function searchExerciseLibrary(
  query: string,
): Promise<ExerciseSearchResult> {
  const db = createServiceClient();
  const q = query.trim();

  let localBuilder = db
    .from("exercises")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(20);
  if (q) localBuilder = localBuilder.ilike("name", `%${q}%`);
  const { data: localRows } = await localBuilder;
  const local = ((localRows as Exercise[]) ?? []).map((r) =>
    mapExerciseRow(r as unknown as Record<string, unknown>),
  );

  const importedIds = new Set(
    local.map((e) => e.exercisedb_id).filter(Boolean) as string[],
  );

  let catalog: ExerciseCatalogItem[] = [];
  if (q) {
    const { data: catalogRows } = await db
      .from("exercise_catalog")
      .select("*")
      .ilike("name", `%${q}%`)
      .order("name", { ascending: true })
      .limit(60);

    if (catalogRows && catalogRows.length > 0) {
      catalog = dedupeCatalogItems(
        catalogRows
          .map((r) => mapCatalogRow(r as Record<string, unknown>))
          .filter((c) => !importedIds.has(c.exercisedb_id)),
      ).slice(0, 25);
    } else {
      const remote = await searchExerciseDbByName(q, 25);
      catalog = remote
        .map((r) => ({ ...toCatalogItem(r), category: toCatalogItem(r).category }))
        .filter((c) => !importedIds.has(c.exercisedb_id));
    }
  }

  return { local, catalog };
}

/** Import a catalog exercise into the local library (or return existing by exercisedb_id). */
export async function importExerciseFromCatalog(
  exercisedbId: string,
): Promise<Exercise> {
  const db = createServiceClient();

  const { data: existing } = await db
    .from("exercises")
    .select("*")
    .eq("exercisedb_id", exercisedbId)
    .maybeSingle();
  if (existing) {
    return mapExerciseRow(existing as unknown as Record<string, unknown>);
  }

  const { data: catalogRow } = await db
    .from("exercise_catalog")
    .select("*")
    .eq("exercisedb_id", exercisedbId)
    .maybeSingle();

  let fields: ReturnType<typeof toExerciseFields>;
  if (catalogRow) {
    fields = {
      exercisedb_id: catalogRow.exercisedb_id,
      name: catalogRow.name,
      gif_url: catalogRow.gif_url,
      body_part: catalogRow.body_part,
      equipment: catalogRow.equipment,
      target_muscle: catalogRow.target_muscle,
      secondary_muscles: (catalogRow.secondary_muscles as string[]) ?? [],
      instructions: (catalogRow.instructions as string[]) ?? [],
      category: catalogRow.category,
    };
  } else {
    const remote = await fetchExerciseDbById(exercisedbId);
    if (!remote) throw new Error("Exercise not found in ExerciseDB");
    fields = toExerciseFields(remote);
  }

  if (fields.instructions.length === 0 || !fields.gif_url) {
    const remote = await fetchExerciseDbById(exercisedbId);
    if (remote) fields = toExerciseFields(remote);
  }

  const { data: inserted, error } = await db
    .from("exercises")
    .insert({ ...fields, is_active: true })
    .select("*")
    .single();
  if (error) {
    if (error.code === "23505") {
      const { data: byName } = await db
        .from("exercises")
        .select("*")
        .eq("name", fields.name)
        .maybeSingle();
      if (byName) {
        await db
          .from("exercises")
          .update(fields)
          .eq("id", byName.id);
        return mapExerciseRow(byName as unknown as Record<string, unknown>);
      }
    }
    throw error;
  }
  return mapExerciseRow(inserted as unknown as Record<string, unknown>);
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

type SetWithMeta = WorkoutSet & {
  session_date: string;
  session_title: string | null;
  exercise_category: string | null;
};

async function fetchCompletedSets(options?: {
  exerciseId?: string;
  sinceDate?: string;
}): Promise<SetWithMeta[]> {
  const db = createServiceClient();
  let query = db
    .from("workout_sets")
    .select(
      "*, workout_sessions!inner(date, title, status, completed_at), exercises(category)",
    )
    .eq("workout_sessions.status", "completed")
    .eq("completed", true);

  if (options?.exerciseId) {
    query = query.eq("exercise_id", options.exerciseId);
  }
  if (options?.sinceDate) {
    query = query.gte("workout_sessions.date", options.sinceDate);
  }

  const { data } = await query.order("created_at", { ascending: false });
  if (!data) return [];

  return data.map((row) => {
    const session = Array.isArray(row.workout_sessions)
      ? row.workout_sessions[0]
      : row.workout_sessions;
    const exercise = Array.isArray(row.exercises)
      ? row.exercises[0]
      : row.exercises;
    const { workout_sessions: _ws, exercises: _ex, ...set } = row;
    return {
      ...(set as WorkoutSet),
      session_date: (session as { date: string }).date,
      session_title: (session as { title: string | null }).title,
      exercise_category: (exercise as { category: string | null } | null)?.category ?? null,
    };
  });
}

export async function getExerciseStats(
  exerciseId: string,
): Promise<ExerciseStats | null> {
  const db = createServiceClient();
  const { data: exercise } = await db
    .from("exercises")
    .select("*")
    .eq("id", exerciseId)
    .maybeSingle();
  if (!exercise) return null;

  const sets = await fetchCompletedSets({ exerciseId });
  const computed = computeExerciseStats(
    sets.map((s) => ({
      weight_lbs: s.weight_lbs,
      reps: s.reps,
      is_warmup: s.is_warmup,
      completed: s.completed,
      session_id: s.session_id,
      date: s.session_date,
    })),
  );

  return { exercise: exercise as Exercise, ...computed };
}

export async function getExerciseHistory(
  exerciseId: string,
  limit = 50,
): Promise<ExerciseHistorySession[]> {
  const sets = await fetchCompletedSets({ exerciseId });
  const bySession = new Map<string, ExerciseHistorySession>();

  for (const set of sets) {
    let entry = bySession.get(set.session_id);
    if (!entry) {
      entry = {
        session_id: set.session_id,
        date: set.session_date,
        title: set.session_title,
        sets: [],
        session_volume_lbs: 0,
        best_est_1rm_lbs: null,
      };
      bySession.set(set.session_id, entry);
    }
    entry.sets.push(set);
    if (!set.is_warmup && set.weight_lbs != null && set.reps != null) {
      entry.session_volume_lbs += setVolume(set.weight_lbs, set.reps);
      const est = estimate1RM(set.weight_lbs, set.reps);
      if (entry.best_est_1rm_lbs == null || est > entry.best_est_1rm_lbs) {
        entry.best_est_1rm_lbs = est;
      }
    }
  }

  return [...bySession.values()]
    .map((s) => ({
      ...s,
      session_volume_lbs: Math.round(s.session_volume_lbs),
      sets: s.sets.sort((a, b) => a.set_index - b.set_index),
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}

/** Last completed session's working sets keyed by set_index (for live workout "Previous" column). */
export async function getLastSessionSetsByIndex(
  exerciseId: string,
  excludeSessionId?: string,
): Promise<Record<number, { weight_lbs: number; reps: number }>> {
  const history = await getExerciseHistory(exerciseId, 20);
  const last = history.find((s) => s.session_id !== excludeSessionId);
  if (!last) return {};

  const byIndex: Record<number, { weight_lbs: number; reps: number }> = {};
  for (const set of last.sets) {
    if (set.is_warmup) continue;
    if (set.weight_lbs == null || set.reps == null) continue;
    byIndex[set.set_index] = { weight_lbs: set.weight_lbs, reps: set.reps };
  }
  return byIndex;
}

export type ExerciseProgressMetric = "heaviest" | "est_1rm" | "set_volume";

export type ExerciseProgressPoint = {
  date: string;
  label: string;
  value: number;
};

function formatProgressLabel(date: string): string {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export async function getExerciseProgressTrend(
  exerciseId: string,
  metric: ExerciseProgressMetric,
  periodDays = 90,
): Promise<ExerciseProgressPoint[]> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const since = addDays(today, -(periodDays - 1));
  const history = await getExerciseHistory(exerciseId, 100);

  const points: ExerciseProgressPoint[] = [];
  for (const session of history) {
    if (session.date < since) continue;
    let best = 0;
    for (const set of session.sets) {
      if (set.is_warmup || !set.completed) continue;
      if (set.weight_lbs == null || set.reps == null) continue;
      let v = 0;
      if (metric === "heaviest") v = set.weight_lbs;
      else if (metric === "est_1rm") v = estimate1RM(set.weight_lbs, set.reps);
      else v = setVolume(set.weight_lbs, set.reps);
      if (v > best) best = v;
    }
    if (best > 0) {
      points.push({
        date: session.date,
        label: formatProgressLabel(session.date),
        value: Math.round(best * 10) / 10,
      });
    }
  }

  return points.sort((a, b) => a.date.localeCompare(b.date));
}

export async function getSessionDetail(
  sessionId: string,
): Promise<ActiveWorkoutView | null> {
  return getActiveWorkout(sessionId);
}

export async function getLiftingDashboard(
  periodDays = 28,
): Promise<LiftingDashboard> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const since = addDays(today, -(periodDays - 1));
  const sets = await fetchCompletedSets({ sinceDate: since });

  const sessionDates = new Set<string>();
  let totalSets = 0;
  let totalVolume = 0;
  const volumeByDate = new Map<string, number>();
  const muscleSets = new Map<string, number>();
  const muscleVolume = new Map<string, number>();

  for (const set of sets) {
    if (set.is_warmup) continue;
    totalSets += 1;
    sessionDates.add(set.session_id);
    const vol = setVolume(set.weight_lbs, set.reps);
    totalVolume += vol;

    volumeByDate.set(
      set.session_date,
      (volumeByDate.get(set.session_date) ?? 0) + vol,
    );

    const cat = set.exercise_category ?? "other";
    muscleSets.set(cat, (muscleSets.get(cat) ?? 0) + 1);
    muscleVolume.set(cat, (muscleVolume.get(cat) ?? 0) + vol);
  }

  const volume_by_day: LiftingDashboard["volume_by_day"] = [];
  for (let i = periodDays - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const d = new Date(`${date}T12:00:00`);
    volume_by_day.push({
      date,
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: timezone }),
      volume_lbs: Math.round(volumeByDate.get(date) ?? 0),
    });
  }

  const muscle_split = [...muscleSets.entries()]
    .map(([category, setCount]) => ({
      category,
      sets: setCount,
      volume_lbs: Math.round(muscleVolume.get(category) ?? 0),
    }))
    .sort((a, b) => b.sets - a.sets);

  const db = createServiceClient();
  const { data: sessions } = await db
    .from("workout_sessions")
    .select("date")
    .eq("status", "completed")
    .gte("date", since)
    .order("date", { ascending: false });

  const workoutDays = new Set((sessions ?? []).map((s) => s.date as string));
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const date = addDays(today, -i);
    if (workoutDays.has(date)) {
      streak += 1;
    } else if (i > 0) {
      break;
    }
  }

  return {
    period_days: periodDays,
    total_sessions: sessionDates.size,
    total_sets: totalSets,
    total_volume_lbs: Math.round(totalVolume),
    current_streak_days: streak,
    volume_by_day,
    muscle_split,
  };
}

export async function getTodayWorkoutSummary(): Promise<WorkoutTodaySummary> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const active = await getActiveSession();

  if (active) {
    const workout = await getActiveWorkout(active.id);
    const startedMs = active.started_at
      ? new Date(active.started_at).getTime()
      : Date.now();
    return {
      status: "in_progress",
      title: active.title,
      session_id: active.id,
      volume_lbs: workout?.total_volume_lbs ?? null,
      duration_seconds: Math.max(0, Math.floor((Date.now() - startedMs) / 1000)),
      started_at: active.started_at,
    };
  }

  const db = createServiceClient();
  const { data: session } = await db
    .from("workout_sessions")
    .select("*")
    .eq("date", today)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (session) {
    const workout = await getActiveWorkout(session.id);
    return {
      status: "completed_today",
      title: session.title,
      session_id: session.id,
      volume_lbs: workout?.total_volume_lbs ?? null,
      duration_seconds: session.duration,
      started_at: session.started_at,
    };
  }

  return {
    status: "none",
    title: null,
    session_id: null,
    volume_lbs: null,
    duration_seconds: null,
    started_at: null,
  };
}
