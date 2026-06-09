import { NextResponse, type NextRequest } from "next/server";
import { searchExercises } from "@/lib/data/workouts";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q") ?? "";
  const exercises = await searchExercises(q);
  return NextResponse.json({ exercises });
}
