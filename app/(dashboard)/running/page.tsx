import { PageHeader } from "@/components/PageHeader";
import { RunningApp } from "@/components/running/RunningApp";
import { getDailyTotals, getNutritionGoals } from "@/lib/data/nutrition";
import { getTimezone } from "@/lib/data/oura";
import {
  getFuelProducts,
  getRecentEasyPace,
  getRunFuelCarbsPerHour,
  getRunningRange,
  getTrainingPlan,
} from "@/lib/data/running";
import { monthGridRange } from "@/lib/run-calendar";
import { normalizeIsoDate, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function RunningPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { date: dateParam, view: viewParam } = await searchParams;
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const selected = normalizeIsoDate(dateParam) ?? today;
  const view = viewParam === "week" ? "week" : "month";
  const { start, end } = monthGridRange(selected);

  // Range first: it sweeps stale plans so the day's targets read clean.
  const range = await getRunningRange(start, end);
  const [goals, totals, pace, rate, plan, fuelProducts] = await Promise.all([
    getNutritionGoals(selected),
    selected <= today ? getDailyTotals(selected) : Promise.resolve({}),
    getRecentEasyPace(),
    getRunFuelCarbsPerHour(),
    getTrainingPlan(5),
    getFuelProducts(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Running"
        subtitle="Plan Calendar, run fuel, and race carb loads."
      />
      <RunningApp
        key={selected}
        today={today}
        selected={selected}
        view={view}
        range={range}
        goals={goals}
        totals={totals}
        pace={pace}
        carbsPerHour={rate}
        plan={plan}
        fuelProducts={fuelProducts}
      />
    </div>
  );
}
