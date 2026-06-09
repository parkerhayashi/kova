"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { removeMeal } from "@/app/(dashboard)/nutrition/actions";
import { fmtNutrient } from "@/lib/nutrition";
import type { Meal } from "@/types";

export function MealLog({ meals }: { meals: Meal[] }) {
  const [pending, startTransition] = useTransition();

  function onDelete(id: string) {
    startTransition(async () => {
      await removeMeal(id);
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="metric-label">Today&apos;s log</span>
        <span className="timestamp">{meals.length} items</span>
      </div>

      {meals.length === 0 ? (
        <p className="body-copy text-sm">Nothing logged yet — search or scan to add food.</p>
      ) : (
        <ul className="divide-border divide-y">
          {meals.map((meal) => (
            <li
              key={meal.id}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-text-primary truncate text-sm">{meal.meal_name}</p>
                <p className="text-text-muted text-xs">
                  {fmtNutrient(meal.calories, " kcal")}
                  {meal.protein_g != null ? ` · ${fmtNutrient(meal.protein_g, "g")} P` : ""}
                  {meal.carbs_g != null ? ` · ${fmtNutrient(meal.carbs_g, "g")} C` : ""}
                  {meal.fat_g != null ? ` · ${fmtNutrient(meal.fat_g, "g")} F` : ""}
                  {meal.servings != null && meal.servings !== 1
                    ? ` · ${meal.servings}×`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(meal.id)}
                disabled={pending}
                aria-label={`Remove ${meal.meal_name}`}
                className="text-text-muted hover:text-[var(--color-stress)] shrink-0 p-1 transition-colors disabled:opacity-50"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
