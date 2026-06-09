import { PageHeader } from "@/components/PageHeader";
import { NutritionApp } from "@/components/nutrition/NutritionApp";
import {
  getCalorieTrend,
  getDailyTotals,
  getMealsForDate,
  getNutritionGoals,
} from "@/lib/data/nutrition";
import { getTimezone } from "@/lib/data/oura";
import { todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NutritionPage() {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);

  const [meals, totals, goals, calorieTrend] = await Promise.all([
    getMealsForDate(today),
    getDailyTotals(today),
    getNutritionGoals(),
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
        totals={totals}
        goals={goals}
        calorieTrend={calorieTrend}
      />
    </div>
  );
}
