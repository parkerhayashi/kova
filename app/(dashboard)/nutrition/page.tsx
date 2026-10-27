import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { LogDatePicker } from "@/components/LogDatePicker";
import { NutritionApp } from "@/components/nutrition/NutritionApp";
import {
  getCalorieTrend,
  getDailyTotals,
  getDietBreakStatus,
  getMealsForDate,
  getNutritionGoals,
  getNutritionWeightTrends,
  getReverseDietStatus,
} from "@/lib/data/nutrition";
import { getSavedMeals } from "@/lib/data/saved-meals";
import { getMidRunIntakesForDate } from "@/lib/data/running";
import { getTimezone } from "@/lib/data/oura";
import { getAlcoholLogForDate } from "@/lib/alcohol-nutrition";
import { parseLogDate } from "@/lib/log-date";
import { todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const logDate = parseLogDate(dateParam, today);

  const [
    meals,
    savedMeals,
    totals,
    goals,
    reverse,
    dietBreak,
    calorieTrend,
    nutritionWeightTrends,
    alcohol,
    runIntakes,
  ] = await Promise.all([
    getMealsForDate(logDate),
    getSavedMeals(),
    getDailyTotals(logDate),
    getNutritionGoals(logDate),
    getReverseDietStatus(),
    getDietBreakStatus(),
    getCalorieTrend(7),
    getNutritionWeightTrends(30),
    getAlcoholLogForDate(logDate),
    getMidRunIntakesForDate(logDate),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Nutrition"
          subtitle="Macros, micronutrients, drinks, and meal logging."
        />
        <Suspense fallback={null}>
          <LogDatePicker selected={logDate} today={today} timezone={timezone} />
        </Suspense>
      </div>
      <NutritionApp
        key={logDate}
        logDate={logDate}
        today={today}
        meals={meals}
        savedMeals={savedMeals}
        totals={totals}
        goals={goals}
        reverse={reverse}
        dietBreak={dietBreak}
        calorieTrend={calorieTrend}
        nutritionWeightTrends={nutritionWeightTrends}
        alcoholDrinks={alcohol.drinks}
        alcoholCalories={alcohol.calories}
        runIntakes={runIntakes}
      />
    </div>
  );
}
