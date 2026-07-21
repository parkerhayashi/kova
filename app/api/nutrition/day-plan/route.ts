import { NextResponse } from "next/server";
import {
  dayPlanConfigError,
  generateDayPlan,
  isDayPlanConfigured,
} from "@/lib/day-plan";
import {
  getDailyTotals,
  getMealsForDate,
  getNutritionGoals,
} from "@/lib/data/nutrition";
import { getTimezone } from "@/lib/data/oura";
import { normalizeIsoDate, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const configError = dayPlanConfigError();
  return NextResponse.json({
    configured: isDayPlanConfigured(),
    error: configError,
  });
}

export async function POST(request: Request) {
  const configError = dayPlanConfigError();
  if (configError) {
    return NextResponse.json({ error: configError }, { status: 503 });
  }

  let body: { prompt?: string; date?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) {
    return NextResponse.json(
      { error: "Say what meals you still need today." },
      { status: 400 },
    );
  }

  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const date = normalizeIsoDate(body.date) ?? today;
  if (date > today) {
    return NextResponse.json({ error: "Date cannot be in the future" }, { status: 400 });
  }

  try {
    const [totals, goals, meals] = await Promise.all([
      getDailyTotals(date),
      getNutritionGoals(date),
      getMealsForDate(date),
    ]);

    const advice = await generateDayPlan({
      prompt,
      totals,
      goals,
      meals,
    });
    return NextResponse.json(advice);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Day plan failed";
    const status = /not configured|invalid|rejected/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
