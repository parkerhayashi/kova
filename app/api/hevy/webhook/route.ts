import { NextResponse, type NextRequest } from "next/server";
import { syncHevyWorkoutById } from "@/lib/data/hevy";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.HEVY_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${secret}`;
}

/**
 * Hevy workout webhook — POST { workoutId } when a workout is saved.
 * Configure in Hevy developer settings with the same Bearer token as
 * HEVY_WEBHOOK_SECRET. Must respond 200 within 5 seconds.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { workoutId?: string };
  try {
    body = (await request.json()) as { workoutId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workoutId = body.workoutId?.trim();
  if (!workoutId) {
    return NextResponse.json({ error: "Missing workoutId" }, { status: 400 });
  }

  try {
    const result = await syncHevyWorkoutById(workoutId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[hevy webhook]", (err as Error).message);
    const message = (err as Error).message;
    const status = message.includes("not connected") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
