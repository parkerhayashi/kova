"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { logMealItems } from "@/app/(dashboard)/nutrition/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import { captureItemToProfile, sumCaptureTotals } from "@/lib/nutrition-capture-utils";
import { scaleNutrients } from "@/lib/nutrition";
import type { CaptureItem, CaptureMatchSource } from "@/types";

function matchLabel(source: CaptureMatchSource): string {
  if (source === "usda") return "USDA match";
  if (source === "restaurant") return "Menu match";
  return "Estimated";
}

function emptyItem(): CaptureItem {
  return {
    id: crypto.randomUUID(),
    name: "New item",
    portion_g: 100,
    confidence: 0.5,
    matchSource: "estimated",
    nutrients: {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    },
  };
}

function CaptureItemRow({
  item,
  onChange,
  onRemove,
  canRemove,
}: {
  item: CaptureItem;
  onChange: (next: CaptureItem) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const macros = useMemo(
    () => ({
      calories: item.nutrients.calories ?? 0,
      protein: item.nutrients.protein_g ?? 0,
      carbs: item.nutrients.carbs_g ?? 0,
      fat: item.nutrients.fat_g ?? 0,
    }),
    [item.nutrients],
  );

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <Input
            value={item.name}
            onChange={(e) => onChange({ ...item, name: e.target.value })}
            className="text-sm font-medium"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                item.matchSource === "estimated"
                  ? "bg-[rgba(255,255,255,0.06)] text-text-muted"
                  : "bg-[rgba(255,255,255,0.08)] text-text-secondary"
              }`}
            >
              {matchLabel(item.matchSource)}
            </span>
            <span className="text-text-muted text-[10px] tabular-nums">
              {Math.round(item.confidence * 100)}% conf.
            </span>
          </div>
        </div>
        {canRemove ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove item"
            className="text-text-muted hover:text-[color:var(--color-stress)] shrink-0 p-1"
          >
            <Trash2 className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="metric-label">Portion</span>
          <span className="text-text-primary text-sm tabular-nums">{item.portion_g}g</span>
        </div>
        <input
          type="range"
          min={10}
          max={800}
          step={5}
          value={item.portion_g}
          onChange={(e) => {
            const nextPortion = Number(e.target.value) || item.portion_g;
            const factor = nextPortion / item.portion_g;
            onChange({
              ...item,
              portion_g: nextPortion,
              nutrients: scaleNutrients(item.nutrients, factor) as CaptureItem["nutrients"],
            });
          }}
          className="w-full accent-white"
        />
        <Input
          type="number"
          min={1}
          step={1}
          value={item.portion_g}
          onChange={(e) => {
            const nextPortion = Math.max(1, Number(e.target.value) || item.portion_g);
            const factor = nextPortion / item.portion_g;
            onChange({
              ...item,
              portion_g: nextPortion,
              nutrients: scaleNutrients(item.nutrients, factor) as CaptureItem["nutrients"],
            });
          }}
        />
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <span className="metric-label">Kcal</span>
          <p className="text-sm tabular-nums" style={{ color: "var(--color-nutrition)" }}>
            {Math.round(macros.calories)}
          </p>
        </div>
        <div>
          <span className="metric-label">Protein</span>
          <p className="text-text-primary text-sm tabular-nums">{Math.round(macros.protein)}g</p>
        </div>
        <div>
          <span className="metric-label">Carbs</span>
          <p className="text-text-primary text-sm tabular-nums">{Math.round(macros.carbs)}g</p>
        </div>
        <div>
          <span className="metric-label">Fat</span>
          <p className="text-text-primary text-sm tabular-nums">{Math.round(macros.fat)}g</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-text-muted hover:text-text-secondary flex w-full items-center justify-between text-xs"
      >
        <span>{expanded ? "Hide" : "Edit"} macros</span>
        <ChevronDown className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded ? (
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ["calories", "Calories", 1],
              ["protein_g", "Protein (g)", 0.1],
              ["carbs_g", "Carbs (g)", 0.1],
              ["fat_g", "Fat (g)", 0.1],
              ["fiber_g", "Fiber (g)", 0.1],
              ["sodium_mg", "Sodium (mg)", 1],
            ] as const
          ).map(([key, label]) => (
            <Field key={key} label={label}>
              <Input
                type="number"
                step={0.1}
                value={item.nutrients[key] ?? ""}
                onChange={(e) => {
                  const val = e.target.value === "" ? undefined : Number(e.target.value);
                  onChange({
                    ...item,
                    nutrients: { ...item.nutrients, [key]: val },
                    matchSource: "estimated",
                  });
                }}
              />
            </Field>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

export function MealCaptureReview({
  date,
  mealName,
  items,
  busy,
  onMealNameChange,
  onItemsChange,
  onRefine,
  onBack,
  onDone,
}: {
  date: string;
  mealName: string;
  items: CaptureItem[];
  busy: boolean;
  onMealNameChange: (name: string) => void;
  onItemsChange: (items: CaptureItem[]) => void;
  onRefine: (fixDescription: string) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const [fixText, setFixText] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const totals = useMemo(() => sumCaptureTotals(items), [items]);

  function updateItem(index: number, next: CaptureItem) {
    const copy = [...items];
    copy[index] = next;
    onItemsChange(copy);
  }

  function removeItem(index: number) {
    onItemsChange(items.filter((_, i) => i !== index));
  }

  function logAll() {
    startTransition(async () => {
      const profiles = items.map(captureItemToProfile);
      await logMealItems({
        date,
        mealName: mealName.trim() || undefined,
        items: profiles,
      });
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-4">
      <div>
        <Field label="Meal name (optional)">
          <Input
            value={mealName}
            onChange={(e) => onMealNameChange(e.target.value)}
            placeholder="Lunch, dinner, snack…"
          />
        </Field>
        <p className="text-text-muted mt-2 text-xs tabular-nums">
          {Math.round(totals.calories ?? 0)} kcal total
          {totals.protein_g != null ? ` · ${Math.round(totals.protein_g)}g protein` : ""}
          {totals.carbs_g != null ? ` · ${Math.round(totals.carbs_g)}g carbs` : ""}
          {totals.fat_g != null ? ` · ${Math.round(totals.fat_g)}g fat` : ""}
        </p>
      </div>

      <div className="space-y-3">
        {items.map((item, index) => (
          <CaptureItemRow
            key={item.id}
            item={item}
            canRemove={items.length > 1}
            onChange={(next) => updateItem(index, next)}
            onRemove={() => removeItem(index)}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="ghost"
        className="w-full"
        onClick={() => onItemsChange([...items, emptyItem()])}
        disabled={busy}
      >
        <Plus className="size-4" />
        Add item
      </Button>

      <Card className="space-y-2 p-3">
        <span className="metric-label">Describe a fix</span>
        <textarea
          value={fixText}
          onChange={(e) => setFixText(e.target.value)}
          placeholder={'e.g. "That\'s salmon not chicken, double the rice"'}
          rows={2}
          className="border-border-strong bg-surface w-full resize-none rounded-lg border px-3 py-2 text-sm"
        />
        <Button
          type="button"
          variant="ghost"
          disabled={busy || !fixText.trim()}
          onClick={() => {
            onRefine(fixText.trim());
            setFixText("");
          }}
        >
          {busy ? "Updating…" : "Apply fix"}
        </Button>
      </Card>

      <div className="flex items-center gap-3 pt-1">
        <Button type="button" onClick={logAll} disabled={pending || busy || items.length === 0}>
          {pending ? "Logging…" : `Log ${items.length} item${items.length === 1 ? "" : "s"}`}
        </Button>
        <button
          type="button"
          onClick={onBack}
          disabled={busy || pending}
          className="text-text-muted text-sm hover:text-text-secondary disabled:opacity-50"
        >
          Retake
        </button>
      </div>
    </div>
  );
}
