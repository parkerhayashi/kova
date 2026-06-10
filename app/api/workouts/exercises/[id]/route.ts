import { NextResponse, type NextRequest } from "next/server";
import {
  getExerciseHistory,
  getExerciseProgressTrend,
  getExerciseStats,
  getLastSessionSetsByIndex,
  type ExerciseProgressMetric,
} from "@/lib/data/workouts";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const view = request.nextUrl.searchParams.get("view");

  if (view === "history") {
    const history = await getExerciseHistory(id);
    return NextResponse.json({ history });
  }

  if (view === "previous") {
    const excludeSessionId =
      request.nextUrl.searchParams.get("exclude_session_id") ?? undefined;
    const previous = await getLastSessionSetsByIndex(id, excludeSessionId);
    return NextResponse.json({ previous });
  }

  if (view === "progress") {
    const metric = (request.nextUrl.searchParams.get("metric") ??
      "heaviest") as ExerciseProgressMetric;
    const days = Number(request.nextUrl.searchParams.get("days") ?? "90");
    const safeMetric: ExerciseProgressMetric =
      metric === "est_1rm" || metric === "set_volume" ? metric : "heaviest";
    const trend = await getExerciseProgressTrend(id, safeMetric, days);
    return NextResponse.json({ trend, metric: safeMetric, days });
  }

  const stats = await getExerciseStats(id);
  if (!stats) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const history = await getExerciseHistory(id, 20);
  return NextResponse.json({ stats, history });
}
