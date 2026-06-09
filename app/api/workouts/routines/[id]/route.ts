import { NextResponse, type NextRequest } from "next/server";
import { getRoutineDetail } from "@/lib/data/workouts";

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
