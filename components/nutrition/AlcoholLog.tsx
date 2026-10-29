"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { setAlcoholDrinksAction } from "@/app/(dashboard)/nutrition/actions";
import { Card } from "@/components/ui/Card";
import {
  CALORIES_PER_DRINK,
  MAX_DRINKS,
  clampDrinks,
  drinkCalories,
} from "@/lib/alcohol-drinks";
import { cn } from "@/lib/utils";

const STEP_BUTTON = cn(
  "flex size-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-40",
  "border-border text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]",
);

/** One-row drink counter: −/+ to step, or type the number directly. */
export function AlcoholLog({
  logDate,
  initialDrinks,
}: {
  logDate: string;
  initialDrinks: number | null;
}) {
  const router = useRouter();
  const [drinks, setDrinks] = useState<number | null>(initialDrinks);
  const [draft, setDraft] = useState(String(initialDrinks ?? 0));
  const [pending, startTransition] = useTransition();
  // Resync when the server value changes (NutritionApp remounts per date).
  const [source, setSource] = useState(initialDrinks);
  if (source !== initialDrinks) {
    setSource(initialDrinks);
    setDrinks(initialDrinks);
    setDraft(String(initialDrinks ?? 0));
  }

  function commit(next: number | null) {
    const normalized = clampDrinks(next);
    setDraft(String(normalized ?? 0));
    if (normalized === drinks) return;
    setDrinks(normalized);
    startTransition(async () => {
      await setAlcoholDrinksAction(logDate, normalized);
      router.refresh();
    });
  }

  const calories = drinkCalories(drinks);

  return (
    <Card className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <span className="metric-label">Alcohol</span>
        <p className="text-text-muted text-xs">
          {drinks ? (
            <span className="tabular-nums" style={{ color: "var(--color-nutrition)" }}>
              +{calories} kcal
            </span>
          ) : (
            `${CALORIES_PER_DRINK} kcal per drink`
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          disabled={pending || !drinks}
          aria-label="One fewer drink"
          onClick={() => commit((drinks ?? 1) - 1)}
          className={STEP_BUTTON}
        >
          <Minus className="size-3.5" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_DRINKS}
          value={draft}
          aria-label="Drinks"
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft.trim() === "" ? null : Number(draft))}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className="field-input w-12 px-1 py-1.5 text-center tabular-nums"
        />
        <button
          type="button"
          disabled={pending || (drinks ?? 0) >= MAX_DRINKS}
          aria-label="One more drink"
          onClick={() => commit((drinks ?? 0) + 1)}
          className={STEP_BUTTON}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </Card>
  );
}
