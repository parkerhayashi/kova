import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { upsertWeight } from "@/lib/data/tracking";

export const dynamic = "force-dynamic";

const LB_PER_KG = 2.204_622_621_8;

function toLbs(weight: number, unit: "kg" | "lb"): number {
  return unit === "kg" ? weight * LB_PER_KG : weight;
}

/** Upsert one daily weight reading (coach tracker). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const date = typeof body?.date === "string" ? body.date : "";
  const weight = Number(body?.weight);
  const unit = body?.unit === "lb" ? "lb" : "kg";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(weight) || weight <= 0) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  await upsertWeight({
    date,
    weight_lbs: Math.round(toLbs(weight, unit) * 10) / 10,
    body_fat_pct: null,
    notes: null,
  });

  revalidatePath("/");
  revalidatePath("/habits");

  return NextResponse.json({ ok: true });
}
