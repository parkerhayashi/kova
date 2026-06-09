import { NextResponse } from "next/server";
import {
  getActiveSession,
  getActiveWorkout,
  getRoutineDetail,
  listRecentSessions,
  listRoutines,
} from "@/lib/data/workouts";

export const dynamic = "force-dynamic";

export async function GET() {
  const [routines, active, recent] = await Promise.all([
    listRoutines(),
    getActiveSession(),
    listRecentSessions(5),
  ]);

  let activeWorkout = null;
  if (active) {
    activeWorkout = await getActiveWorkout(active.id);
  }

  const routineDetails = await Promise.all(
    routines.map((r) => getRoutineDetail(r.id)),
  );

  return NextResponse.json({
    routines: routineDetails.filter(Boolean),
    activeWorkout,
    recentSessions: recent,
  });
}
