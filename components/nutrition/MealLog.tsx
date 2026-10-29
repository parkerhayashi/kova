"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { removeMeal, removeMealGroup } from "@/app/(dashboard)/nutrition/actions";
import { fmtNutrient, sumMeals } from "@/lib/nutrition";
import { cn } from "@/lib/utils";
import type { Meal } from "@/types";

/** A log entry: a single food, or a meal (saved meal / AI capture) of several ingredients. */
type LogEntry =
  | { kind: "single"; meal: Meal }
  | { kind: "group"; id: string; name: string; items: Meal[] };

function toEntries(meals: Meal[]): LogEntry[] {
  const entries: LogEntry[] = [];
  const groups = new Map<string, Extract<LogEntry, { kind: "group" }>>();
  for (const meal of meals) {
    if (!meal.meal_group_id) {
      entries.push({ kind: "single", meal });
      continue;
    }
    let group = groups.get(meal.meal_group_id);
    if (!group) {
      group = {
        kind: "group",
        id: meal.meal_group_id,
        name: meal.meal_group_name || "Meal",
        items: [],
      };
      groups.set(meal.meal_group_id, group);
      entries.push(group);
    }
    group.items.push(meal);
  }
  return entries;
}

function macroLine(m: {
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
}): string {
  return [
    fmtNutrient(m.calories, " kcal"),
    m.protein_g != null ? `${fmtNutrient(m.protein_g, "g")} P` : null,
    m.carbs_g != null ? `${fmtNutrient(m.carbs_g, "g")} C` : null,
    m.fat_g != null ? `${fmtNutrient(m.fat_g, "g")} F` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function DeleteButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="text-text-muted hover:text-[var(--color-stress)] shrink-0 p-1 transition-colors disabled:opacity-50"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

export function MealLog({
  meals,
  logDate,
  today,
}: {
  meals: Meal[];
  logDate: string;
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(meals);
  const [source, setSource] = useState(meals);
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (source !== meals) {
    setSource(meals);
    setItems(meals);
  }

  function remove(ids: Set<string>, action: () => Promise<void>) {
    setItems((prev) => prev.filter((meal) => !ids.has(meal.id)));
    startTransition(async () => {
      try {
        await action();
      } finally {
        router.refresh();
      }
    });
  }

  function toggle(groupId: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  const entries = toEntries(items);

  return (
    <Card className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="metric-label">
          {logDate === today ? "Today's log" : "Meal log"}
        </span>
        <span className="timestamp">
          {entries.length} {entries.length === 1 ? "entry" : "entries"}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="body-copy text-sm">Nothing logged yet — search or capture to add food.</p>
      ) : (
        <ul className="divide-border divide-y">
          {entries.map((entry) => {
            if (entry.kind === "single") {
              const meal = entry.meal;
              return (
                <li key={meal.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-text-primary truncate text-sm">{meal.meal_name}</p>
                    <p className="text-text-muted text-xs">
                      {macroLine(meal)}
                      {meal.servings != null && meal.servings !== 1 ? ` · ${meal.servings}×` : ""}
                    </p>
                  </div>
                  <DeleteButton
                    label={`Remove ${meal.meal_name}`}
                    disabled={pending}
                    onClick={() => remove(new Set([meal.id]), () => removeMeal(meal.id))}
                  />
                </li>
              );
            }

            const expanded = open.has(entry.id);
            const totals = sumMeals(entry.items);
            return (
              <li key={entry.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggle(entry.id)}
                    aria-expanded={expanded}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-text-primary truncate text-sm">{entry.name}</p>
                      <p className="text-text-muted text-xs">
                        {macroLine(totals)} · {entry.items.length}{" "}
                        {entry.items.length === 1 ? "item" : "items"}
                      </p>
                    </div>
                    <ChevronDown
                      className={cn(
                        "text-text-muted mt-0.5 size-4 shrink-0 transition-transform",
                        expanded && "rotate-180",
                      )}
                    />
                  </button>
                  <DeleteButton
                    label={`Remove ${entry.name}`}
                    disabled={pending}
                    onClick={() =>
                      remove(new Set(entry.items.map((m) => m.id)), () => removeMealGroup(entry.id))
                    }
                  />
                </div>

                {expanded ? (
                  <ul className="border-border mt-2 ml-1 space-y-2 border-l pl-3">
                    {entry.items.map((meal) => (
                      <li key={meal.id} className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-text-secondary truncate text-sm">
                            {meal.meal_name}
                            {meal.servings != null && meal.servings !== 1 ? (
                              <span className="text-text-muted"> · {meal.servings}×</span>
                            ) : null}
                          </p>
                          <p className="text-text-muted text-xs">{macroLine(meal)}</p>
                        </div>
                        <DeleteButton
                          label={`Remove ${meal.meal_name} from ${entry.name}`}
                          disabled={pending}
                          onClick={() => remove(new Set([meal.id]), () => removeMeal(meal.id))}
                        />
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
