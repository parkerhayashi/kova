import { NextResponse, type NextRequest } from "next/server";
import {
  addRoutineExercise,
  getRoutineDetail,
  removeRoutineExercise,
  reorderRoutineExercises,
  replaceRoutineExercise,
  updateRoutineExercise,
  updateRoutineName,
} from "@/lib/data/workouts";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const routine = await getRoutineDetail(id);
  if (!routine) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(routine);
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id: routineId } = await context.params;
  const body = await request.json().catch(() => null);
  const action = typeof body?.action === "string" ? body.action : "";

  try {
    if (action === "update_name") {
      const name = typeof body?.name === "string" ? body.name : "";
      await updateRoutineName(routineId, name);
    } else if (action === "reorder") {
      const orderedIds = Array.isArray(body?.ordered_ids)
        ? body.ordered_ids.filter((item: unknown) => typeof item === "string")
        : [];
      await reorderRoutineExercises(routineId, orderedIds);
    } else if (action === "add_exercise") {
      const exerciseId =
        typeof body?.exercise_id === "string" ? body.exercise_id : "";
      if (!exerciseId) {
        return NextResponse.json({ error: "exercise_id required" }, { status: 400 });
      }
      await addRoutineExercise(routineId, exerciseId);
    } else if (action === "replace_exercise") {
      const routineExerciseId =
        typeof body?.routine_exercise_id === "string"
          ? body.routine_exercise_id
          : "";
      const exerciseId =
        typeof body?.exercise_id === "string" ? body.exercise_id : "";
      if (!routineExerciseId || !exerciseId) {
        return NextResponse.json({ error: "Invalid input" }, { status: 400 });
      }
      await replaceRoutineExercise(routineExerciseId, exerciseId);
    } else if (action === "update_exercise") {
      const routineExerciseId =
        typeof body?.routine_exercise_id === "string"
          ? body.routine_exercise_id
          : "";
      if (!routineExerciseId) {
        return NextResponse.json(
          { error: "routine_exercise_id required" },
          { status: 400 },
        );
      }
      const patch: Parameters<typeof updateRoutineExercise>[1] = {};
      if ("notes" in body) {
        patch.notes =
          typeof body.notes === "string" && body.notes.trim()
            ? body.notes.trim()
            : null;
      }
      if (body?.rest_seconds != null) patch.rest_seconds = Number(body.rest_seconds);
      if (body?.target_sets != null) patch.target_sets = Number(body.target_sets);
      if ("rep_min" in body) {
        patch.rep_min =
          body.rep_min === null || body.rep_min === ""
            ? null
            : Number(body.rep_min);
      }
      if ("rep_max" in body) {
        patch.rep_max =
          body.rep_max === null || body.rep_max === ""
            ? null
            : Number(body.rep_max);
      }
      await updateRoutineExercise(routineExerciseId, patch);
    } else if (action === "remove_exercise") {
      const routineExerciseId =
        typeof body?.routine_exercise_id === "string"
          ? body.routine_exercise_id
          : "";
      if (!routineExerciseId) {
        return NextResponse.json(
          { error: "routine_exercise_id required" },
          { status: 400 },
        );
      }
      await removeRoutineExercise(routineExerciseId);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const routine = await getRoutineDetail(routineId);
    if (!routine) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ routine });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 500 },
    );
  }
}
