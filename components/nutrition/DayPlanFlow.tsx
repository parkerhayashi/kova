"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2, MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import type { DailyTotals } from "@/lib/nutrition";
import type { ComputedNutritionGoals } from "@/lib/nutrition-goals";
import type { DayPlanAdvice } from "@/lib/day-plan";

function remaining(goal: number, used: number | undefined): number {
  return Math.max(0, Math.round(goal - (used ?? 0)));
}

export function DayPlanFlow({
  date,
  totals,
  goals,
  onClose,
}: {
  date: string;
  totals: DailyTotals;
  goals: ComputedNutritionGoals;
  onClose: () => void;
}) {
  const [configured, setConfigured] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState(
    "I still need a pre-workout snack and dinner at Duke Dining.",
  );
  const [advice, setAdvice] = useState<DayPlanAdvice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/nutrition/day-plan", { cache: "no-store" })
      .then((res) => res.json())
      .then((json: { configured?: boolean; error?: string }) => {
        if (cancelled) return;
        setConfigured(Boolean(json.configured));
        setConfigError(json.error ?? null);
      })
      .catch(() => {
        if (!cancelled) setConfigError("Could not load day plan.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const left = {
    calories: remaining(goals.calories, totals.calories),
    protein_g: remaining(goals.protein_g, totals.protein_g),
    carbs_g: remaining(goals.carbs_g, totals.carbs_g),
    fat_g: remaining(goals.fat_g, totals.fat_g),
  };

  function generate() {
    if (!prompt.trim()) {
      setError("Say what meals you still need.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/nutrition/day-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim(), date }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          typeof json?.error === "string" ? json.error : "Could not plan the day.",
        );
        return;
      }
      setAdvice(json as DayPlanAdvice);
    });
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="metric-label">Rest of day</span>
          <p className="text-text-muted mt-1 text-sm">
            Say what meals you still have. Mention Duke Dining (or a hall) to get
            real menu items from the catalog.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close day plan"
          className="text-text-muted hover:text-text-primary rounded-lg p-2"
        >
          <X className="size-4" />
        </button>
      </div>

      {!configured ? (
        <p className="text-xs text-[var(--color-stress)]">
          {configError ?? "Day plan is not configured."}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Cals left" value={`${left.calories}`} />
        <Stat label="Protein left" value={`${left.protein_g}g`} />
        <Stat label="Carbs left" value={`${left.carbs_g}g`} />
        <Stat label="Fat left" value={`${left.fat_g}g`} />
      </div>

      <Field label="What's left today?">
        <Input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. dinner at Duke Dining, or Gothic Grill + a snack"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              generate();
            }
          }}
        />
      </Field>

      <Button
        type="button"
        variant="primary"
        onClick={generate}
        disabled={pending || !configured}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <MessageSquare className="size-4" />
        )}
        {pending ? "Planning…" : "Plan the rest"}
      </Button>

      {error ? (
        <p className="text-xs text-[var(--color-stress)]">{error}</p>
      ) : null}

      {advice ? (
        <div className="border-border space-y-4 rounded-xl border p-3">
          <div>
            <h3 className="text-text-primary text-base font-semibold">
              {advice.headline}
            </h3>
            <p className="text-text-muted mt-1 text-sm">{advice.summary}</p>
            {advice.catalog_source ? (
              <p className="text-text-muted mt-2 text-xs">
                Menu items from {advice.catalog_source}
              </p>
            ) : null}
          </div>

          <ul className="space-y-3">
            {advice.meals.map((meal) => (
              <li
                key={meal.name}
                className="rounded-xl bg-[rgba(255,255,255,0.03)] px-3 py-2.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold text-text-primary">{meal.name}</span>
                  <span className="text-text-muted text-xs tabular-nums">
                    {meal.calories} kcal · {meal.protein_g}P / {meal.carbs_g}C /{" "}
                    {meal.fat_g}F
                  </span>
                </div>
                {meal.catalog_items?.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {meal.catalog_items.map((item) => (
                      <li
                        key={`${meal.name}:${item.id}:${item.servings}`}
                        className="text-sm text-text-secondary"
                      >
                        <span className="text-text-primary font-medium">
                          {item.name}
                        </span>
                        {item.servings !== 1 ? (
                          <span className="text-text-muted">
                            {" "}
                            ×{item.servings}
                          </span>
                        ) : null}
                        <span className="text-text-muted">
                          {" "}
                          · {item.location}
                        </span>
                        {item.calories != null || item.protein_g != null ? (
                          <span className="text-text-muted tabular-nums">
                            {" "}
                            —{" "}
                            {[
                              item.calories != null
                                ? `${Math.round(item.calories)} kcal`
                                : null,
                              item.protein_g != null
                                ? `${Math.round(item.protein_g)}P`
                                : null,
                              item.carbs_g != null
                                ? `${Math.round(item.carbs_g)}C`
                                : null,
                              item.fat_g != null
                                ? `${Math.round(item.fat_g)}F`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="text-text-secondary mt-2 list-inside list-disc text-sm">
                    {meal.ideas.map((idea) => (
                      <li key={idea}>{idea}</li>
                    ))}
                  </ul>
                )}
                {meal.notes ? (
                  <p className="text-text-muted mt-1.5 text-xs">{meal.notes}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <span className="metric-label">{label}</span>
      <p className="mt-1 text-base font-semibold tabular-nums text-text-primary">
        {value}
      </p>
    </div>
  );
}
