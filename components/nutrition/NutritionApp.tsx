"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { GoalSettings } from "@/components/nutrition/GoalSettings";
import { MacroSummary } from "@/components/nutrition/MacroSummary";
import { MealCaptureFlow } from "@/components/nutrition/MealCaptureFlow";
import { MealLog } from "@/components/nutrition/MealLog";
import { CalorieTrend, MicroProgress, NutritionWeightTrends } from "@/components/nutrition/NutritionCharts";
import type { DualTrendView } from "@/lib/trends/types";
import { SavedMeals } from "@/components/nutrition/SavedMeals";
import { DukeDiningSearch } from "@/components/nutrition/DukeDiningSearch";
import { RestaurantSearch } from "@/components/nutrition/RestaurantSearch";
import { BarcodeEntry, FoodSearch } from "@/components/nutrition/FoodSearch";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
  nutritionWeightTrends,
}: {
  logDate: string;
  today: string;
  meals: Meal[];
  savedMeals: SavedMeal[];
  totals: DailyTotals;
  goals: ComputedNutritionGoals;
  calorieTrend: { date: string; calories: number; goal: number }[];
  nutritionWeightTrends: DualTrendView[];
}) {
  const [captureOpen, setCaptureOpen] = useState(false);

  return (
    <div className="space-y-6">
      <GoalSettings goals={goals} />
      <MacroSummary totals={totals} goals={goals} meta={goals.meta} />

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="metric-label">AI meal capture</span>
          <p className="text-text-muted mt-1 text-sm">
            Snap a photo, review items, and log with macro + micro estimates.
          </p>
        </div>
        <Button type="button" variant="primary" onClick={() => setCaptureOpen(true)}>
          <Sparkles className="size-4" />
          Capture food
        </Button>
      </Card>

      {captureOpen ? (
        <MealCaptureFlow date={logDate} onClose={() => setCaptureOpen(false)} />
      ) : null}

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

      <NutritionWeightTrends views={nutritionWeightTrends} />
    </div>
  );
}
