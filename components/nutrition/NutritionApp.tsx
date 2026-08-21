"use client";

import { useState } from "react";
import { MessageSquare, Sparkles, Utensils } from "lucide-react";
import { GoalSettings } from "@/components/nutrition/GoalSettings";
import { AlcoholLog } from "@/components/nutrition/AlcoholLog";
import { MacroSummary } from "@/components/nutrition/MacroSummary";
import { DayPlanFlow } from "@/components/nutrition/DayPlanFlow";
import { MealCaptureFlow } from "@/components/nutrition/MealCaptureFlow";
import { MealMakerFlow } from "@/components/nutrition/MealMakerFlow";
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
import type { ReverseDietView } from "@/lib/reverse-diet";
import type { Meal, SavedMeal } from "@/types";

export function NutritionApp({
  logDate,
  today,
  meals,
  savedMeals,
  totals,
  goals,
  reverse,
  calorieTrend,
  nutritionWeightTrends,
  alcoholHabitId,
  alcoholDrinks,
  alcoholCalories,
}: {
  logDate: string;
  today: string;
  meals: Meal[];
  savedMeals: SavedMeal[];
  totals: DailyTotals;
  goals: ComputedNutritionGoals;
  reverse: ReverseDietView;
  calorieTrend: { date: string; calories: number; goal: number }[];
  nutritionWeightTrends: DualTrendView[];
  alcoholHabitId: string | null;
  alcoholDrinks: number | null;
  alcoholCalories: number;
}) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [makerOpen, setMakerOpen] = useState(false);
  const [dayPlanOpen, setDayPlanOpen] = useState(false);

  function openOnly(which: "capture" | "maker" | "dayPlan") {
    setCaptureOpen(which === "capture");
    setMakerOpen(which === "maker");
    setDayPlanOpen(which === "dayPlan");
  }

  return (
    <div className="space-y-6">
      <MacroSummary
        totals={totals}
        goals={goals}
        meta={goals.meta}
        alcoholCalories={alcoholCalories}
      />
      <AlcoholLog
        logDate={logDate}
        habitId={alcoholHabitId}
        initialDrinks={alcoholDrinks}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch">
          <div>
            <span className="metric-label">AI meal capture</span>
            <p className="text-text-muted mt-1 text-sm">
              Snap a photo, review items, and log with macro + micro estimates.
            </p>
          </div>
          <Button type="button" variant="primary" onClick={() => openOnly("capture")}>
            <Sparkles className="size-4" />
            Capture food
          </Button>
        </Card>

        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch">
          <div>
            <span className="metric-label">AI meal maker</span>
            <p className="text-text-muted mt-1 text-sm">
              Pick Duke Dining or a restaurant, set targets, get a menu meal to save.
            </p>
          </div>
          <Button type="button" variant="primary" onClick={() => openOnly("maker")}>
            <Utensils className="size-4" />
            Make a meal
          </Button>
        </Card>

        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex-col lg:items-stretch">
          <div>
            <span className="metric-label">Rest of day</span>
            <p className="text-text-muted mt-1 text-sm">
              Split remaining macros across the meals you still need.
            </p>
          </div>
          <Button type="button" variant="primary" onClick={() => openOnly("dayPlan")}>
            <MessageSquare className="size-4" />
            Plan the day
          </Button>
        </Card>
      </section>

      {captureOpen ? (
        <MealCaptureFlow date={logDate} onClose={() => setCaptureOpen(false)} />
      ) : null}

      {makerOpen ? (
        <MealMakerFlow
          date={logDate}
          totals={totals}
          goals={goals}
          onClose={() => setMakerOpen(false)}
        />
      ) : null}

      {dayPlanOpen ? (
        <DayPlanFlow
          date={logDate}
          totals={totals}
          goals={goals}
          onClose={() => setDayPlanOpen(false)}
        />
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

      <GoalSettings goals={goals} reverse={reverse} />
    </div>
  );
}
