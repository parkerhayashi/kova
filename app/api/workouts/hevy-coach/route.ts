import { NextResponse } from "next/server";
import { getHevyCoachPayload, isHevyConnected } from "@/lib/data/hevy";

export const dynamic = "force-dynamic";

/** Compact Hevy top-set payload for Coach localStorage sync. */
export async function GET() {
  if (!isHevyConnected()) {
    return NextResponse.json({ workouts: [] });
  }

  const workouts = await getHevyCoachPayload();
  return NextResponse.json({ workouts });
}
