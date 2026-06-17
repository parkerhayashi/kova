import { NextResponse } from "next/server";
import {
  getActiveSession,
  getActiveWorkout,
  getLiftingDashboard,
  getRoutineDetail,
  getTodayWorkoutSummary,
  listRecentSessions,
  listRoutines,
} from "@/lib/data/workouts";
import {
  getHevyLastSyncedAt,
  isHevyConnected,
  listHevyWorkouts,
} from "@/lib/data/hevy";
import { getTimezone } from "@/lib/data/oura";

export const dynamic = "force-dynamic";

export async function GET() {
  const [routines, active, recent, dashboard, todaySummary, hevyWorkouts, hevyLastSynced, timezone, hevyConnected] =
    await Promise.all([
      listRoutines(),
      getActiveSession(),
      listRecentSessions(5),
      getLiftingDashboard(28),
      getTodayWorkoutSummary(),
      listHevyWorkouts(50),
      getHevyLastSyncedAt(),
      getTimezone(),
      Promise.resolve(isHevyConnected()),
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
    dashboard,
    todaySummary,
    hevy: {
      connected: hevyConnected,
      lastSyncedAt: hevyLastSynced,
      timezone,
      workouts: hevyWorkouts,
    },
  });
}
