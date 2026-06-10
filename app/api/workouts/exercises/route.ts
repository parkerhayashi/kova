import { NextResponse, type NextRequest } from "next/server";
import {
  importExerciseFromCatalog,
  searchExerciseLibrary,
} from "@/lib/data/workouts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const result = await searchExerciseLibrary(q);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const exercisedbId =
    body && typeof body.exercisedb_id === "string"
      ? body.exercisedb_id.trim()
      : "";
  if (!exercisedbId) {
    return NextResponse.json({ error: "exercisedb_id required" }, { status: 400 });
  }
  try {
    const exercise = await importExerciseFromCatalog(exercisedbId);
    return NextResponse.json({ exercise });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 404 },
    );
  }
}
