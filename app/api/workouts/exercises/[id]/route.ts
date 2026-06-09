import { NextResponse, type NextRequest } from "next/server";
import { getExerciseHistory, getExerciseStats } from "@/lib/data/workouts";

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

  const stats = await getExerciseStats(id);
  if (!stats) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const history = await getExerciseHistory(id, 20);
  return NextResponse.json({ stats, history });
}
