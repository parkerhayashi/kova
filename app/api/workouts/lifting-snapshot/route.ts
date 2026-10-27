import { NextResponse, type NextRequest } from "next/server";
import { getLiftingCompositionSnapshot } from "@/lib/data/workouts";

export const dynamic = "force-dynamic";

/** Hevy lifting stats for the Coach weight composition estimate. */
export async function GET(request: NextRequest) {
  const days = Math.min(
    90,
    Math.max(7, Number(request.nextUrl.searchParams.get("days")) || 30),
  );

  const snapshot = await getLiftingCompositionSnapshot(days);
  return NextResponse.json(snapshot);
}
