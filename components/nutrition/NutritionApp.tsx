"use client";

import { GoalSettings } from "@/components/nutrition/GoalSettings";
import { MacroSummary } from "@/components/nutrition/MacroSummary";
import { MealLog } from "@/components/nutrition/MealLog";
import { CalorieTrend, MicroProgress } from "@/components/nutrition/NutritionCharts";
import { SavedMeals } from "@/components/nutrition/SavedMeals";
import { DukeDiningSearch } from "@/components/nutrition/DukeDiningSearch";
import { RestaurantSearch } from "@/components/nutrition/RestaurantSearch";
import { BarcodeEntry, FoodSearch } from "@/components/nutrition/FoodSearch";
import type { ComputedNutritionGoals } from "@/lib/nutrition-goals";
import type { DailyTotals } from "@/lib/nutrition";
import type { Meal, SavedMeal } from "@/types";

export function NutritionApp({
  logDate,
  today,
  meals,
  savedMeals,
  totals,
  goals,
  calorieTrend,
}: {
  logDate: string;
  today: string;
  meals: Meal[];
  savedMeals: SavedMeal[];
  totals: DailyTotals;
  goals: ComputedNutritionGoals;
  calorieTrend: { date: string; calories: number; goal: number }[];
}) {
  return (
    <div className="space-y-6">
      <GoalSettings goals={goals} />
      <MacroSummary totals={totals} goals={goals} meta={goals.meta} />

      <section className="grid gap-4 lg:grid-cols-2">
        <FoodSearch date={logDate} />
        <BarcodeEntry date={logDate} />
      </section>

      <DukeDiningSearch date={logDate} />

      <RestaurantSearch date={logDate} />

      <SavedMeals date={logDate} meals={savedMeals} />

      <MealLog meals={meals} logDate={logDate} today={today} />

      <section className="grid gap-4 lg:grid-cols-2">
        <CalorieTrend trend={calorieTrend} />
        <MicroProgress totals={totals} />
      </section>
    </div>
  );
}
