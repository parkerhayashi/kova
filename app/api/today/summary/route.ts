import { NextResponse } from "next/server";
import { getDailyTotals, getNutritionGoals } from "@/lib/data/nutrition";
import { getTimezone } from "@/lib/data/oura";
import { getLatestWeight, getWeightForDate } from "@/lib/data/tracking";
import { todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Lightweight top-bar snapshot: calories, weight, (optional) supplements. */
export async function GET() {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);

  const [totals, goals, todayWeight, latestWeight] = await Promise.all([
    getDailyTotals(today),
    getNutritionGoals(today),
    getWeightForDate(today),
    getLatestWeight(),
  ]);

  const weight = todayWeight ?? latestWeight;

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
  });
}
