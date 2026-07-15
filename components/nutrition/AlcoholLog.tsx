"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { setHabitDrinkTier } from "@/app/(dashboard)/habits/actions";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  DRINK_TIERS,
  DRINK_TIER_CALORIES,
  formatDrinkTier,
} from "@/lib/habit-drinks";
import type { DrinkTier } from "@/types";

export function AlcoholLog({
  logDate,
  habitId,
  initialTier,
}: {
  logDate: string;
  /** Alcohol day-tag habit id, or null if none exists yet. */
  habitId: string | null;
  initialTier: DrinkTier | null;
}) {
  const router = useRouter();
  const [tier, setTier] = useState<DrinkTier | null>(initialTier);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setTier(initialTier);
  }, [logDate, initialTier]);

  const calories = tier ? DRINK_TIER_CALORIES[tier] : 0;
  const label = formatDrinkTier(tier);

  function select(next: DrinkTier | null) {
    if (!habitId) return;
    setTier(next);
    startTransition(async () => {
      await setHabitDrinkTier(habitId, logDate, next);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="metric-label">Alcohol</span>
          <p className="text-text-muted mt-1 text-xs">
            Same log as Habits — counts toward today’s calorie total.
          </p>
        </div>
        {tier ? (
          <span
            className="text-sm font-semibold tabular-nums"
            style={{ color: "var(--color-nutrition)" }}
          >
            +{calories} kcal
          </span>
        ) : null}
      </div>

      {!habitId ? (
        <p className="text-text-muted text-sm">
          Add an Alcohol day tag on Habits to start logging drinks here.
        </p>
      ) : (
        <>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Alcohol drink amount"
          >
            {DRINK_TIERS.map((option) => {
              const selected = tier === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={pending}
                  aria-pressed={selected}
                  onClick={() => select(selected ? null : option.id)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                    selected
                      ? "border-[color:var(--color-stress)] bg-[color:var(--color-stress)] text-[#0e0e0e]"
                      : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]",
                  )}
                >
                  {option.label}
                  <span className="text-[10px] opacity-70">
                    {" "}
                    · {DRINK_TIER_CALORIES[option.id]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-text-muted text-xs">
            {label
              ? `${label} logged for this day.`
              : "No drinks logged — tap a bucket if you drank."}
          </p>
        </>
      )}
    </Card>
  );
}
