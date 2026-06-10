import { PageHeader } from "@/components/PageHeader";
import { NutritionApp } from "@/components/nutrition/NutritionApp";
import {
  getCalorieTrend,
  getDailyTotals,
  getMealsForDate,
  getNutritionGoals,
} from "@/lib/data/nutrition";
import { getSavedMeals } from "@/lib/data/saved-meals";
import { getTimezone } from "@/lib/data/oura";
import { todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NutritionPage() {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);

  const [meals, savedMeals, totals, goals, calorieTrend] = await Promise.all([
    getMealsForDate(today),
    getSavedMeals(),
    getDailyTotals(today),
    getNutritionGoals(today),
    getCalorieTrend(7),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nutrition"
        subtitle="Macros, micronutrients, and meal logging."
      />
      <NutritionApp
        today={today}
        meals={meals}
        savedMeals={savedMeals}
        totals={totals}
        goals={goals}
        calorieTrend={calorieTrend}
      />
    </div>
  );
}
