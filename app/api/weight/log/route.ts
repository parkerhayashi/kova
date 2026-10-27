import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { getTimezone } from "@/lib/data/oura";
import { deleteWeight, upsertWeight } from "@/lib/data/tracking";
import { normalizeIsoDate, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LB_PER_KG = 2.204_622_621_8;

function toLbs(weight: number, unit: "kg" | "lb"): number {
  return unit === "kg" ? weight * LB_PER_KG : weight;
}

function refreshWeightPaths() {
  revalidatePath("/");
  revalidatePath("/weight");
  revalidatePath("/workouts");
}

/**
 * Resolve the calendar day for a weigh-in.
 * When logging "today", always use the server's timezone-aware today — never
 * trust the client date (iOS date inputs and device clocks shift it back a day).
 */
async function resolveLogDate(body: {
  date?: unknown;
  forToday?: unknown;
}): Promise<string | null> {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  if (body?.forToday === true) return today;
  return normalizeIsoDate(body?.date);
}

/** Upsert one daily weight reading. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const date = await resolveLogDate(body ?? {});
  const weight = Number(body?.weight);
  const unit = body?.unit === "lb" ? "lb" : "kg";

  if (!date || !Number.isFinite(weight) || weight <= 0) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  try {
    await upsertWeight({
      date,
      weight_lbs: Math.round(toLbs(weight, unit) * 10) / 10,
      body_fat_pct: null,
      notes: null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Save failed" },
      { status: 500 },
    );
  }

  refreshWeightPaths();

  return NextResponse.json({ ok: true, date });
}

/** Delete one daily weight reading. */
export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const date = normalizeIsoDate(body?.date);
  if (!date) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  try {
    await deleteWeight(date);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Delete failed" },
      { status: 500 },
    );
  }
  refreshWeightPaths();
  return NextResponse.json({ ok: true, date });
}
