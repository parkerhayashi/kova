"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { logMeal } from "@/app/(dashboard)/nutrition/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import {
  MICRONUTRIENT_RDA,
  scaleNutrients,
  type NutrientKey,
} from "@/lib/nutrition";
import type { NutrientProfile } from "@/types";

const MACRO_ROWS: {
  key: NutrientKey;
  label: string;
  unit: string;
  accent?: string;
}[] = [
  { key: "calories", label: "Calories", unit: " kcal", accent: "var(--color-nutrition)" },
  { key: "protein_g", label: "Protein", unit: "g", accent: "var(--color-nutrition)" },
  { key: "carbs_g", label: "Carbs", unit: "g", accent: "var(--color-activity)" },
  { key: "fat_g", label: "Fat", unit: "g", accent: "var(--color-stress)" },
  { key: "fiber_g", label: "Fiber", unit: "g" },
  { key: "sugar_g", label: "Sugar", unit: "g" },
  { key: "sodium_mg", label: "Sodium", unit: "mg" },
  { key: "potassium_mg", label: "Potassium", unit: "mg" },
  { key: "saturated_fat_g", label: "Sat. fat", unit: "g" },
  { key: "cholesterol_mg", label: "Cholesterol", unit: "mg" },
];

const EXTRA_MICRO_KEYS = new Set(MICRONUTRIENT_RDA.map((r) => r.key));

function StatCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="border-border rounded-lg border bg-[rgba(255,255,255,0.02)] px-3 py-2">
      <span className="metric-label">{label}</span>
      <p
        className="text-text-primary mt-0.5 text-lg font-medium tabular-nums"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

export function FoodDetailPanel({
  profile,
  date,
  onDone,
  onCancel,
}: {
  profile: NutrientProfile;
  date: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [servings, setServings] = useState(1);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const perServing = profile.nutrients;
  const scaled = useMemo(
    () => scaleNutrients(profile.nutrients, servings),
    [profile.nutrients, servings],
  );

  const per100g =
    profile.serving_size_g > 0
      ? scaleNutrients(profile.nutrients, 100 / profile.serving_size_g)
      : null;

  const microRows = MICRONUTRIENT_RDA.filter(
    (r) => perServing[r.key] != null && perServing[r.key]! > 0,
  );

  const extraMicros = Object.entries(perServing).filter(
    ([key, val]) =>
      typeof val === "number" &&
      val > 0 &&
      !MACRO_ROWS.some((m) => m.key === key) &&
      !EXTRA_MICRO_KEYS.has(key as NutrientKey),
  ) as [NutrientKey, number][];

  function submit() {
    setError(null);
    startTransition(async () => {
      try {
        await logMeal(profile, date, servings);
        router.refresh();
        onDone();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not log meal");
      }
    });
  }

  return (
    <Card className="space-y-4">
      <div>
        <span className="metric-label">
          {profile.source === "usda"
            ? "USDA"
            : profile.source === "duke_dining"
              ? "Duke Dining"
              : profile.source === "restaurant"
                ? "Restaurant"
                : profile.source === "saved_meal"
                  ? "Saved meal"
                  : "Open Food Facts"}
        </span>
        <h3 className="text-text-primary mt-1 text-base font-medium leading-snug">
          {profile.name}
        </h3>
        <p className="text-text-muted mt-1 text-xs">
          Per serving · {profile.serving_size_g}g
          {per100g ? " · values below are per listed serving" : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatCell
          label="Calories / serving"
          value={perServing.calories != null ? `${Math.round(perServing.calories)}` : "—"}
          accent="var(--color-nutrition)"
        />
        <StatCell
          label="Protein"
          value={perServing.protein_g != null ? `${Math.round(perServing.protein_g)}g` : "—"}
          accent="var(--color-nutrition)"
        />
        <StatCell
          label="Carbs"
          value={perServing.carbs_g != null ? `${Math.round(perServing.carbs_g)}g` : "—"}
          accent="var(--color-activity)"
        />
        <StatCell
          label="Fat"
          value={perServing.fat_g != null ? `${Math.round(perServing.fat_g)}g` : "—"}
          accent="var(--color-stress)"
        />
      </div>

      {per100g && profile.serving_size_g !== 100 ? (
        <p className="text-text-muted text-xs">
          Per 100g:{" "}
          {per100g.calories != null ? `${Math.round(per100g.calories)} kcal` : "—"}
          {per100g.protein_g != null ? ` · ${Math.round(per100g.protein_g)}g protein` : ""}
          {per100g.carbs_g != null ? ` · ${Math.round(per100g.carbs_g)}g carbs` : ""}
          {per100g.fat_g != null ? ` · ${Math.round(per100g.fat_g)}g fat` : ""}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => setShowAll((s) => !s)}
        className="text-text-muted hover:text-text-secondary flex w-full items-center justify-between text-xs"
      >
        <span>{showAll ? "Hide" : "Show"} full nutrition label</span>
        <ChevronDown
          className={`size-4 transition-transform ${showAll ? "rotate-180" : ""}`}
        />
      </button>

      {showAll ? (
        <div className="border-border max-h-64 overflow-y-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-border border-b">
                <th className="text-text-muted px-3 py-2 text-left font-normal">Nutrient</th>
                <th className="text-text-muted px-3 py-2 text-right font-normal">/ serving</th>
                {servings !== 1 ? (
                  <th className="text-text-muted px-3 py-2 text-right font-normal">
                    × {servings}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {MACRO_ROWS.map(({ key, label }) => {
                const base = perServing[key];
                if (base == null) return null;
                return (
                  <tr key={key} className="border-border border-b border-dashed last:border-0">
                    <td className="text-text-secondary px-3 py-1.5">{label}</td>
                    <td className="text-text-primary px-3 py-1.5 text-right tabular-nums">
                      {key === "calories"
                        ? Math.round(base)
                        : Math.round(base * 10) / 10}
                      {key === "calories" ? "" : key.endsWith("_mg") ? " mg" : " g"}
                    </td>
                    {servings !== 1 ? (
                      <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "var(--color-nutrition)" }}>
                        {key === "calories"
                          ? Math.round(scaled[key] ?? 0)
                          : Math.round((scaled[key] ?? 0) * 10) / 10}
                        {key === "calories" ? "" : key.endsWith("_mg") ? " mg" : " g"}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {microRows.map((r) => (
                <tr key={r.key} className="border-border border-b border-dashed last:border-0">
                  <td className="text-text-secondary px-3 py-1.5">{r.label}</td>
                  <td className="text-text-primary px-3 py-1.5 text-right tabular-nums">
                    {Math.round((perServing[r.key] ?? 0) * 10) / 10} {r.unit}
                  </td>
                  {servings !== 1 ? (
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "var(--color-nutrition)" }}>
                      {Math.round((scaled[r.key] ?? 0) * 10) / 10} {r.unit}
                    </td>
                  ) : null}
                </tr>
              ))}
              {extraMicros.map(([key, val]) => (
                <tr key={key} className="border-border border-b border-dashed last:border-0">
                  <td className="text-text-secondary px-3 py-1.5">{key.replace(/_/g, " ")}</td>
                  <td className="text-text-primary px-3 py-1.5 text-right tabular-nums">
                    {Math.round(val * 10) / 10}
                  </td>
                  {servings !== 1 ? (
                    <td className="px-3 py-1.5 text-right tabular-nums" style={{ color: "var(--color-nutrition)" }}>
                      {Math.round((scaled[key] ?? 0) * 10) / 10}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="border-border space-y-3 border-t pt-3">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Servings" className="min-w-[6rem]">
            <Input
              type="number"
              min={0.25}
              step={0.25}
              value={servings}
              onChange={(e) => setServings(Number(e.target.value) || 1)}
            />
          </Field>
          <div className="flex-1">
            <span className="metric-label">You&apos;ll log</span>
            <p className="text-text-primary mt-0.5 text-sm tabular-nums">
              {scaled.calories != null ? `${Math.round(scaled.calories)} kcal` : "—"}
              {scaled.protein_g != null ? ` · ${Math.round(scaled.protein_g)}g protein` : ""}
              {scaled.carbs_g != null ? ` · ${Math.round(scaled.carbs_g)}g carbs` : ""}
              {scaled.fat_g != null ? ` · ${Math.round(scaled.fat_g)}g fat` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Logging…" : "Log food"}
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="text-text-muted text-sm hover:text-text-secondary"
          >
            Cancel
          </button>
        </div>
        {error ? (
          <p className="text-sm" style={{ color: "var(--color-stress)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
