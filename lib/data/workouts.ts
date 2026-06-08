/**
 * Server-side data layer for the native strength tracker (blueprint Phase 4,
 * self-logged in Kova). Weights are stored in lbs. Reads and writes go through
 * the service client; import only from Server Components and Server Actions.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { addDays, todayInTimezone } from "@/lib/utils";
import type {
  Exercise,
  SessionExerciseGroup,
  WorkoutSet,
  WorkoutSession,
} from "@/types";

/** Epley one-rep-max estimate from a working set. */
export function est1RM(weight: number | null, reps: number | null): number | null {
  if (!weight || !reps || reps <= 0) return null;
  return Math.round(weight * (1 + reps / 30));
}

/** Total volume (lbs) of a set list — working sets only (warm-ups excluded). */
export function setsVolume(sets: WorkoutSet[]): number {
  return sets.reduce((sum, s) => {
    if (s.is_warmup || !s.weight_lbs || !s.reps) return sum;
    return sum + s.weight_lbs * s.reps;
  }, 0);
}

// ---------------------------------------------------------------------------
// Exercises (library)
// ---------------------------------------------------------------------------
export async function getExercises(activeOnly = true): Promise<Exercise[]> {
  const db = createServiceClient();
  let query = db.from("exercises").select("*").order("name", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return (data as Exercise[]) ?? [];
}

export async function addExercise(input: {
  name: string;
  category: string | null;
  equipment: string | null;
}): Promise<Exercise | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("exercises")
    .upsert({ ...input, name: input.name.trim() }, { onConflict: "name" })
    .select()
    .single();
  return (data as Exercise) ?? null;
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
export async function createSession(input: {
  date: string;
  title: string | null;
}): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("workout_sessions")
    .insert(input)
    .select("id")
    .single();
  return (data as { id: string } | null)?.id ?? null;
}

export async function updateSession(
  id: string,
  fields: Partial<Pick<WorkoutSession, "title" | "notes" | "date" | "duration">>,
): Promise<void> {
  const db = createServiceClient();
  await db.from("workout_sessions").update(fields).eq("id", id);
}

export async function deleteSession(id: string): Promise<void> {
  const db = createServiceClient();
  await db.from("workout_sessions").delete().eq("id", id);
}

export async function getSession(id: string): Promise<WorkoutSession | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("workout_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as WorkoutSession) ?? null;
}

/** Full session detail: sets grouped by exercise in logging order. */
export async function getSessionDetail(id: string): Promise<{
  session: WorkoutSession;
  groups: SessionExerciseGroup[];
} | null> {
  const db = createServiceClient();
  const session = await getSession(id);
  if (!session) return null;

  const [{ data: setsData }, exercises] = await Promise.all([
    db
      .from("workout_sets")
      .select("*")
      .eq("session_id", id)
      .order("position", { ascending: true })
      .order("set_index", { ascending: true }),
    getExercises(false),
  ]);

  const sets = (setsData as WorkoutSet[]) ?? [];
  const exById = new Map(exercises.map((e) => [e.id, e]));

  const groups: SessionExerciseGroup[] = [];
  const byExercise = new Map<string, SessionExerciseGroup>();
  for (const set of sets) {
    let group = byExercise.get(set.exercise_id);
    if (!group) {
      const exercise = exById.get(set.exercise_id);
      if (!exercise) continue;
      group = { exercise, position: set.position, sets: [] };
      byExercise.set(set.exercise_id, group);
      groups.push(group);
    }
    group.sets.push(set);
  }
  groups.sort((a, b) => a.position - b.position);
  return { session, groups };
}

export interface SessionSummary {
  session: WorkoutSession;
  volume: number;
  setCount: number;
  exerciseCount: number;
}

/** Recent sessions with computed volume/counts, newest first. */
export async function getSessionSummaries(days: number): Promise<SessionSummary[]> {
  const db = createServiceClient();
  const { data: sessionsData } = await db
    .from("workout_sessions")
    .select("*")
    .gte("date", addDays(todayInTimezone(), -days))
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  const sessions = (sessionsData as WorkoutSession[]) ?? [];
  if (sessions.length === 0) return [];

  const ids = sessions.map((s) => s.id);
  const { data: setsData } = await db
    .from("workout_sets")
    .select("*")
    .in("session_id", ids);
  const sets = (setsData as WorkoutSet[]) ?? [];

  const bySession = new Map<string, WorkoutSet[]>();
  for (const s of sets) {
    const bucket = bySession.get(s.session_id) ?? [];
    bucket.push(s);
    if (bucket.length === 1) bySession.set(s.session_id, bucket);
  }

  return sessions.map((session) => {
    const sessionSets = bySession.get(session.id) ?? [];
    const exerciseCount = new Set(sessionSets.map((s) => s.exercise_id)).size;
    return {
      session,
      volume: Math.round(setsVolume(sessionSets)),
      setCount: sessionSets.filter((s) => !s.is_warmup).length,
      exerciseCount,
    };
  });
}

export interface ExercisePR {
  exercise: Exercise;
  topWeight: number;
  topWeightReps: number;
  best1RM: number;
}

/** Best heaviest set + estimated 1RM per exercise across all history. */
export async function getPersonalRecords(): Promise<ExercisePR[]> {
  const db = createServiceClient();
  const [{ data: setsData }, exercises] = await Promise.all([
    db
      .from("workout_sets")
      .select("*")
      .eq("is_warmup", false)
      .not("weight_lbs", "is", null)
      .not("reps", "is", null),
    getExercises(false),
  ]);
  const sets = (setsData as WorkoutSet[]) ?? [];
  const exById = new Map(exercises.map((e) => [e.id, e]));

  const prByExercise = new Map<string, ExercisePR>();
  for (const s of sets) {
    if (!s.weight_lbs || !s.reps) continue;
    const exercise = exById.get(s.exercise_id);
    if (!exercise) continue;
    const oneRm = est1RM(s.weight_lbs, s.reps) ?? 0;
    const current = prByExercise.get(s.exercise_id);
    if (!current) {
      prByExercise.set(s.exercise_id, {
        exercise,
        topWeight: s.weight_lbs,
        topWeightReps: s.reps,
        best1RM: oneRm,
      });
      continue;
    }
    if (s.weight_lbs > current.topWeight) {
      current.topWeight = s.weight_lbs;
      current.topWeightReps = s.reps;
    }
    if (oneRm > current.best1RM) current.best1RM = oneRm;
  }

  return [...prByExercise.values()].sort((a, b) => b.best1RM - a.best1RM);
}

// ---------------------------------------------------------------------------
// Sets
// ---------------------------------------------------------------------------
async function nextPosition(sessionId: string): Promise<number> {
  const db = createServiceClient();
  const { data } = await db
    .from("workout_sets")
    .select("position")
    .eq("session_id", sessionId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { position: number } | null)?.position ?? -1) + 1;
}

/** Add an exercise to a session by creating its first (empty) set. */
export async function addExerciseToSession(
  sessionId: string,
  exerciseId: string,
): Promise<WorkoutSet | null> {
  const db = createServiceClient();
  const position = await nextPosition(sessionId);
  const { data } = await db
    .from("workout_sets")
    .insert({
      session_id: sessionId,
      exercise_id: exerciseId,
      position,
      set_index: 0,
    })
    .select()
    .single();
  return (data as WorkoutSet) ?? null;
}

/** Append a set to an exercise already in the session, copying its order. */
export async function addSet(input: {
  session_id: string;
  exercise_id: string;
  position: number;
  set_index: number;
  weight_lbs: number | null;
  reps: number | null;
}): Promise<WorkoutSet | null> {
  const db = createServiceClient();
  const { data } = await db.from("workout_sets").insert(input).select().single();
  return (data as WorkoutSet) ?? null;
}

export async function updateSet(
  id: string,
  fields: Partial<
    Pick<WorkoutSet, "weight_lbs" | "reps" | "rpe" | "is_warmup" | "completed">
  >,
): Promise<void> {
  const db = createServiceClient();
  await db.from("workout_sets").update(fields).eq("id", id);
}

export async function deleteSet(id: string): Promise<void> {
  const db = createServiceClient();
  await db.from("workout_sets").delete().eq("id", id);
}

export async function removeExerciseFromSession(
  sessionId: string,
  exerciseId: string,
): Promise<void> {
  const db = createServiceClient();
  await db
    .from("workout_sets")
    .delete()
    .eq("session_id", sessionId)
    .eq("exercise_id", exerciseId);
}
