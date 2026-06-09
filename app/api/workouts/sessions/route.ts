import { NextResponse, type NextRequest } from "next/server";
import {
  cancelSession,
  completeSession,
  getActiveWorkout,
  getExerciseStats,
  reorderSessionExercises,
  replaceSessionExercise,
  startSessionFromRoutine,
  upsertWorkoutSet,
} from "@/lib/data/workouts";
import { checkSetPRs } from "@/lib/workouts";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";

  try {
    if (action === "start") {
      const routineId = typeof body?.routine_id === "string" ? body.routine_id : "";
      if (!routineId) {
        return NextResponse.json({ error: "routine_id required" }, { status: 400 });
      }
      const workout = await startSessionFromRoutine(routineId);
      return NextResponse.json(workout);
    }

    const sessionId =
      typeof body?.session_id === "string" ? body.session_id : "";
    if (!sessionId) {
      return NextResponse.json({ error: "session_id required" }, { status: 400 });
    }

    if (action === "complete") {
      const session = await completeSession(sessionId);
      return NextResponse.json({ session });
    }

    if (action === "cancel") {
      await cancelSession(sessionId);
      return NextResponse.json({ ok: true });
    }

    if (action === "reorder") {
      const orderedIds = Array.isArray(body?.ordered_ids)
        ? body.ordered_ids.filter((id: unknown) => typeof id === "string")
        : [];
      await reorderSessionExercises(sessionId, orderedIds);
      const workout = await getActiveWorkout(sessionId);
      return NextResponse.json(workout);
    }

    if (action === "replace_exercise") {
      const sessionExerciseId =
        typeof body?.session_exercise_id === "string"
          ? body.session_exercise_id
          : "";
      const exerciseId =
        typeof body?.exercise_id === "string" ? body.exercise_id : "";
      if (!sessionExerciseId || !exerciseId) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }
      await replaceSessionExercise(sessionExerciseId, exerciseId);
      const workout = await getActiveWorkout(sessionId);
      return NextResponse.json(workout);
    }

    if (action === "upsert_set") {
      const sessionExerciseId =
        typeof body?.session_exercise_id === "string"
          ? body.session_exercise_id
          : "";
      const setIndex = Number(body?.set_index);
      if (!sessionExerciseId || !Number.isInteger(setIndex) || setIndex < 0) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }

      const weight =
        body?.weight_lbs === null || body?.weight_lbs === undefined
          ? null
          : Number(body.weight_lbs);
      const reps =
        body?.reps === null || body?.reps === undefined
          ? null
          : Number(body.reps);

      let pr = null;
      if (
        body?.completed !== false &&
        weight != null &&
        reps != null &&
        weight > 0 &&
        reps > 0
      ) {
        const { createServiceClient } = await import("@/lib/supabase/server");
        const db = createServiceClient();
        const { data: sessionEx } = await db
          .from("workout_session_exercises")
          .select("exercise_id")
          .eq("id", sessionExerciseId)
          .maybeSingle();
        if (sessionEx) {
          const stats = await getExerciseStats(sessionEx.exercise_id);
          if (stats) {
            const { exercise: _ex, ...prior } = stats;
            pr = checkSetPRs(prior, weight, reps);
          }
        }
      }

      const set = await upsertWorkoutSet({
        session_id: sessionId,
        session_exercise_id: sessionExerciseId,
        set_index: setIndex,
        weight_lbs: weight,
        reps,
        completed: body?.completed !== false,
      });
      const workout = await getActiveWorkout(sessionId);
      return NextResponse.json({ set, workout, pr });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id required" }, { status: 400 });
  }
  const workout = await getActiveWorkout(sessionId);
  if (!workout) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(workout);
}
