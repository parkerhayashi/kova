"use client";

import { MacroSummary } from "@/components/nutrition/MacroSummary";
import { MealLog } from "@/components/nutrition/MealLog";
import { CalorieTrend, MicroProgress } from "@/components/nutrition/NutritionCharts";
import { BarcodeEntry, FoodSearch } from "@/components/nutrition/FoodSearch";
import type { DailyTotals, NutritionGoals } from "@/lib/nutrition";
import type { Meal } from "@/types";

export function NutritionApp({
  today,
  meals,
  totals,
  goals,
  calorieTrend,
}: {
  today: string;
  meals: Meal[];
  totals: DailyTotals;
  goals: NutritionGoals;
  calorieTrend: { date: string; calories: number }[];
}) {
  return (
    <div className="space-y-6">
      <MacroSummary totals={totals} goals={goals} />

      <section className="grid gap-4 lg:grid-cols-2">
        <FoodSearch date={today} />
        <BarcodeEntry date={today} />
      </section>

      <MealLog meals={meals} />

      <section className="grid gap-4 lg:grid-cols-2">
        <CalorieTrend trend={calorieTrend} goal={goals.calories} />
        <MicroProgress totals={totals} />
      </section>
    </div>
  );
}
