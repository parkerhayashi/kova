import { NextResponse, type NextRequest } from "next/server";
import { getAllWeightLogs } from "@/lib/data/tracking";

export const dynamic = "force-dynamic";

const LB_PER_KG = 2.204_622_621_8;

function toDisplayWeight(weightLbs: number, unit: "kg" | "lb"): number {
  return unit === "kg" ? weightLbs / LB_PER_KG : weightLbs;
}

/** Weight entries for the coach tracker ({ dateKey, weight } in user's unit). */
export async function GET(request: NextRequest) {
  const unit = request.nextUrl.searchParams.get("unit") === "lb" ? "lb" : "kg";
  const logs = await getAllWeightLogs();
  const entries = logs.map((row) => ({
    dateKey: row.date,
    weight: Math.round(toDisplayWeight(row.weight_lbs, unit) * 10) / 10,
  }));
  return NextResponse.json({ entries, unit });
}
