"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { setAlcoholDrinksAction } from "@/app/(dashboard)/nutrition/actions";
import { Card } from "@/components/ui/Card";
import {
  CALORIES_PER_DRINK,
  MAX_DRINKS,
  drinkCalories,
  formatDrinkCount,
} from "@/lib/alcohol-drinks";
import { cn } from "@/lib/utils";

export function AlcoholLog({
  logDate,
  initialDrinks,
}: {
  logDate: string;
  initialDrinks: number | null;
}) {
  const router = useRouter();
  const [drinks, setDrinks] = useState<number | null>(initialDrinks);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDrinks(initialDrinks);
  }, [logDate, initialDrinks]);

  const calories = drinkCalories(drinks);
  const label = formatDrinkCount(drinks);

  function commit(next: number | null) {
    const normalized =
      next == null || next <= 0 ? null : Math.min(MAX_DRINKS, next);
    setDrinks(normalized);
    startTransition(async () => {
      await setAlcoholDrinksAction(logDate, normalized);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="metric-label">Alcohol</span>
          <p className="text-text-muted mt-1 text-xs">
            {CALORIES_PER_DRINK} kcal per drink toward this day&apos;s calorie
            total.
          </p>
        </div>
        {drinks ? (
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color: "var(--color-nutrition)" }}
          >
            +{calories} kcal
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={pending || !drinks}
          aria-label="Fewer drinks"
          onClick={() => commit((drinks ?? 1) - 1)}
          className={cn(
            "flex size-9 items-center justify-center rounded-lg border transition-colors disabled:opacity-40",
            "border-border text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]",
          )}
        >
          <Minus className="size-4" />
        </button>
        <div className="min-w-[4.5rem] text-center">
          <p className="text-2xl font-semibold tabular-nums text-text-primary">
            {drinks ?? 0}
          </p>
          <p className="text-text-muted text-[10px] uppercase tracking-wide">
            drinks
          </p>
        </div>
        <button
          type="button"
          disabled={pending || (drinks ?? 0) >= MAX_DRINKS}
          aria-label="More drinks"
          onClick={() => commit((drinks ?? 0) + 1)}
          className={cn(
            "flex size-9 items-center justify-center rounded-lg border transition-colors disabled:opacity-40",
            "border-border text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]",
          )}
        >
          <Plus className="size-4" />
        </button>
        {drinks ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => commit(null)}
            className="text-text-muted hover:text-text-primary ml-1 text-xs underline-offset-2 hover:underline disabled:opacity-50"
          >
            Clear
          </button>
        ) : null}
      </div>
      <p className="text-text-muted text-xs">
        {label
          ? `${label} logged for this day.`
          : "No drinks logged — tap + if you drank."}
      </p>
    </Card>
  );
}
