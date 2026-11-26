import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { syncHevyWorkoutById } from "@/lib/data/hevy";

export const dynamic = "force-dynamic";

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Hevy sends whatever is in the portal's authorization field verbatim, so
 * accept the secret with or without the "Bearer " prefix.
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.HEVY_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const auth = (request.headers.get("authorization") ?? "").trim();
  return same(auth, `Bearer ${secret}`) || same(auth, secret);
}

/**
 * Hevy workout webhook — POST { workoutId } when a workout is saved.
 * Configure in Hevy's developer portal with HEVY_WEBHOOK_SECRET as the
 * authorization value ("Bearer <secret>" or just the secret). Must respond 200
 * within 5 seconds; after repeated failures Hevy disconnects the webhook.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    console.warn(
      `[hevy webhook] 401 — ${process.env.HEVY_WEBHOOK_SECRET?.trim() ? "authorization header doesn't match HEVY_WEBHOOK_SECRET" : "HEVY_WEBHOOK_SECRET is not set"}`,
    );
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
