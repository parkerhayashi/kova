import { NextResponse } from "next/server";
import { getDailyTotals, getNutritionGoals } from "@/lib/data/nutrition";
import { getTimezone } from "@/lib/data/oura";
import {
  getLatestWeight,
  getSupplementLogsForDate,
  getSupplements,
  getWeightForDate,
} from "@/lib/data/tracking";
import { todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Lightweight top-bar snapshot: calories, weight, supplements taken today. */
export async function GET() {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);

  const [totals, goals, todayWeight, latestWeight, supplements, supplementLogs] =
    await Promise.all([
      getDailyTotals(today),
      getNutritionGoals(today),
      getWeightForDate(today),
      getLatestWeight(),
      getSupplements(true),
      getSupplementLogsForDate(today),
    ]);

  const weight = todayWeight ?? latestWeight;
  // Only count active supplements so archived ones logged earlier don't inflate it.
  const activeIds = new Set(supplements.map((s) => s.id));
  const supplementsTaken = new Set(
    supplementLogs
      .filter((l) => l.taken && activeIds.has(l.supplement_id))
      .map((l) => l.supplement_id),
  ).size;

  return NextResponse.json({
    today,
    calories: {
      done: Math.round(totals.calories ?? 0),
      total: goals.calories,
    },
    weight: weight
      ? {
          lbs: Math.round(weight.weight_lbs * 10) / 10,
          date: weight.date,
          isToday: weight.date === today,
        }
      : null,
    supplements: { done: supplementsTaken, total: supplements.length },
  });
}
