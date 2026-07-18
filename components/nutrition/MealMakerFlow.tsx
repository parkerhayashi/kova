"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, X } from "lucide-react";
import {
  logSavedMealAction,
  saveSavedMealAction,
} from "@/app/(dashboard)/nutrition/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { savedMealTotalsLabel } from "@/lib/saved-meals";
import type { MealMakerPlace } from "@/lib/meal-maker";
import type { ComputedNutritionGoals } from "@/lib/nutrition-goals";
import type { DailyTotals } from "@/lib/nutrition";
import type { SavedMealComponent } from "@/types";

type Proposal = {
  meal_name: string;
  mode: "preset" | "custom";
  rationale: string;
  components: SavedMealComponent[];
  unmatched_ids?: string[];
};

function remaining(goal: number | undefined, used: number | undefined): number | null {
  if (goal == null || goal <= 0) return null;
  const left = goal - (used ?? 0);
  return left > 0 ? Math.round(left) : null;
}

export function MealMakerFlow({
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
  const router = useRouter();
  const [places, setPlaces] = useState<MealMakerPlace[]>([]);
  const [configured, setConfigured] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [placeKey, setPlaceKey] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [notes, setNotes] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [mealName, setMealName] = useState("");
  const [components, setComponents] = useState<SavedMealComponent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [saving, startSave] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/nutrition/meal-maker", { cache: "no-store" })
      .then((res) => res.json())
      .then(
        (json: {
          configured?: boolean;
          error?: string;
          places?: MealMakerPlace[];
        }) => {
          if (cancelled) return;
          setConfigured(Boolean(json.configured));
          setConfigError(json.error ?? null);
          setPlaces(json.places ?? []);
        },
      )
      .catch(() => {
        if (!cancelled) setConfigError("Could not load meal maker.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    // Prefill remaining room under today's goals once.
    const cal = remaining(goals.calories, totals.calories);
    const pro = remaining(goals.protein_g, totals.protein_g);
    const carb = remaining(goals.carbs_g, totals.carbs_g);
    const f = remaining(goals.fat_g, totals.fat_g);
    if (cal != null) setCalories(String(cal));
    if (pro != null) setProtein(String(pro));
    if (carb != null) setCarbs(String(carb));
    if (f != null) setFat(String(f));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional one-shot prefills
  }, []);

  const selected = useMemo(() => {
    if (!placeKey) return null;
    const [kind, ...rest] = placeKey.split(":");
    const id = rest.join(":");
    if (kind !== "duke" && kind !== "restaurant") return null;
    return places.find((p) => p.kind === kind && p.id === id) ?? null;
  }, [placeKey, places]);

  const totalsLabel = useMemo(
    () => (components.length ? savedMealTotalsLabel(components) : "—"),
    [components],
  );

  function generate() {
    if (!selected) {
      setError("Pick where you are eating.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/nutrition/meal-maker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: selected.kind,
          placeId: selected.id,
          targets: {
            calories: calories ? Number(calories) : null,
            protein_g: protein ? Number(protein) : null,
            carbs_g: carbs ? Number(carbs) : null,
            fat_g: fat ? Number(fat) : null,
            notes: notes.trim() || null,
          },
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          typeof json?.error === "string" ? json.error : "Could not build a meal.",
        );
        return;
      }
      const next = json as Proposal;
      setProposal(next);
      setMealName(next.meal_name);
      setComponents(next.components);
    });
  }

  function updateServings(index: number, servings: number) {
    setComponents((prev) =>
      prev.map((c, i) =>
        i === index
          ? { ...c, servings: Number.isFinite(servings) && servings > 0 ? servings : c.servings }
          : c,
      ),
    );
  }

  function removeComponent(index: number) {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  }

  function saveTemplate() {
    const name = mealName.trim();
    if (!name || components.length === 0) {
      setError("Name the meal and keep at least one item.");
      return;
    }
    setError(null);
    startSave(async () => {
      await saveSavedMealAction({ name, components });
      router.refresh();
      onClose();
    });
  }

  function logNow() {
    const name = mealName.trim() || "Meal maker";
    if (components.length === 0) {
      setError("Nothing to log.");
      return;
    }
    setError(null);
    startSave(async () => {
      const saved = await saveSavedMealAction({ name, components });
      await logSavedMealAction(saved.id, date);
      router.refresh();
      onClose();
    });
  }

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="metric-label">Meal maker</span>
          <p className="text-text-muted mt-1 text-sm">
            Pick a Duke hall or restaurant, set targets, and get a menu-based meal.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close meal maker"
          className="text-text-muted hover:text-text-primary rounded-lg p-2"
        >
          <X className="size-4" />
        </button>
      </div>

      {!configured ? (
        <p className="text-xs text-[var(--color-stress)]">
          {configError ?? "Meal maker is not configured."}
        </p>
      ) : null}

      <Field label="Where are you eating?">
        <select
          className="border-border bg-surface text-text-primary w-full rounded-lg border px-3 py-2 text-sm"
          value={placeKey}
          onChange={(e) => setPlaceKey(e.target.value)}
        >
          <option value="">Select a place…</option>
          {places.map((p) => (
            <option key={`${p.kind}:${p.id}`} value={`${p.kind}:${p.id}`}>
              {p.name} ({p.itemCount})
            </option>
          ))}
        </select>
      </Field>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Calories">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 650"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
          />
        </Field>
        <Field label="Protein (g)">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 50"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
          />
        </Field>
        <Field label="Carbs (g)">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="optional"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
          />
        </Field>
        <Field label="Fat (g)">
          <Input
            type="number"
            inputMode="numeric"
            placeholder="optional"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Preferences">
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. high protein bowl, no dairy, light on rice"
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          onClick={generate}
          disabled={pending || !configured}
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {pending ? "Building…" : "Make meal"}
        </Button>
      </div>

      {error ? (
        <p className="text-xs text-[var(--color-stress)]">{error}</p>
      ) : null}

      {proposal && components.length > 0 ? (
        <div className="border-border space-y-3 rounded-xl border p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Field label="Meal name" className="min-w-[12rem] flex-1">
              <Input
                value={mealName}
                onChange={(e) => setMealName(e.target.value)}
              />
            </Field>
            <p className="text-text-muted text-xs tabular-nums">{totalsLabel}</p>
          </div>
          {proposal.rationale ? (
            <p className="text-text-muted text-sm">{proposal.rationale}</p>
          ) : null}
          <p className="text-text-muted text-[11px] uppercase tracking-wider">
            {proposal.mode === "preset" ? "Preset / curated pick" : "Custom build"}
          </p>

          <ul className="divide-border divide-y">
            {components.map((c, i) => (
              <li
                key={`${c.food_id ?? c.name}-${i}`}
                className="flex flex-wrap items-center gap-2 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 font-medium text-text-primary">
                  {c.name}
                </span>
                <label className="text-text-muted flex items-center gap-1 text-xs">
                  ×
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    className="w-16"
                    value={String(c.servings)}
                    onChange={(e) => updateServings(i, Number(e.target.value))}
                  />
                </label>
                <button
                  type="button"
                  className="text-text-muted hover:text-[var(--color-stress)] text-xs"
                  onClick={() => removeComponent(i)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          {proposal.unmatched_ids?.length ? (
            <p className="text-xs text-[var(--color-activity)]">
              Skipped unknown menu ids: {proposal.unmatched_ids.join(", ")}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              onClick={saveTemplate}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save to saved meals"}
            </Button>
            <Button type="button" onClick={logNow} disabled={saving}>
              {saving ? "Logging…" : "Save & log today"}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
