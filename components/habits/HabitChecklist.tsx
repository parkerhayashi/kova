"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Flame, Shield } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  setHabitDrinkTier,
  toggleHabit,
} from "@/app/(dashboard)/habits/actions";
import {
  DRINK_TIERS,
  formatDrinkTier,
  isDrinkQuantityHabit,
} from "@/lib/habit-drinks";
import type { DrinkTier, HabitKind } from "@/types";

export interface HabitRow {
  id: string;
  name: string;
  kind: HabitKind;
  completed: boolean;
  amountTier: DrinkTier | null;
  streak: number;
  weekRate: number;
}

function rowStateKey(habits: HabitRow[]): string {
  return habits
    .map((h) => `${h.id}:${h.completed ? 1 : 0}:${h.amountTier ?? ""}`)
    .join("|");
}

function HabitRowButton({
  habit,
  checked,
  onToggle,
}: {
  habit: HabitRow;
  checked: boolean;
  onToggle: () => void;
}) {
  const isTrack = habit.kind === "track";

  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.03)]"
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
          checked
            ? isTrack
              ? "border-transparent bg-[color:var(--color-stress)]"
              : "border-transparent bg-[color:var(--color-recovery)]"
            : "border-border-strong",
        )}
      >
        {checked ? (
          <Check className="size-4 text-[#0e0e0e]" strokeWidth={3} />
        ) : null}
      </span>
      <span
        className={cn(
          "flex-1 text-sm",
          checked ? "text-text-primary" : "text-text-secondary",
        )}
      >
        {habit.name}
      </span>
      {isTrack && checked ? (
        <span className="timestamp">yes</span>
      ) : null}
      {habit.streak > 0 ? (
        <span className="text-text-muted inline-flex items-center gap-1 text-xs">
          {isTrack ? (
            <Shield className="size-3.5" strokeWidth={1.5} />
          ) : (
            <Flame className="size-3.5" strokeWidth={1.5} />
          )}
          {habit.streak}
          {isTrack ? "d clear" : null}
        </span>
      ) : null}
      {!isTrack ? (
        <span className="timestamp w-10 text-right">
          {Math.round(habit.weekRate * 100)}%
        </span>
      ) : null}
    </button>
  );
}

function DrinkTagRow({
  habit,
  tier,
  logged,
  onSelect,
}: {
  habit: HabitRow;
  tier: DrinkTier | null;
  logged: boolean;
  onSelect: (tier: DrinkTier | null) => void;
}) {
  const label = formatDrinkTier(tier);
  const active = tier != null || logged;

  return (
    <div className="space-y-3 px-5 py-3.5">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full border",
            active
              ? "border-transparent bg-[color:var(--color-stress)]"
              : "border-border-strong",
          )}
          aria-hidden
        >
          {active ? (
            <Check className="size-4 text-[#0e0e0e]" strokeWidth={3} />
          ) : null}
        </span>
        <span
          className={cn(
            "flex-1 text-sm",
            active ? "text-text-primary" : "text-text-secondary",
          )}
        >
          {habit.name}
        </span>
        {label ? (
          <span className="timestamp">{label}</span>
        ) : logged ? (
          <span className="timestamp">pick amount</span>
        ) : null}
        {habit.streak > 0 ? (
          <span className="text-text-muted inline-flex items-center gap-1 text-xs">
            <Shield className="size-3.5" strokeWidth={1.5} />
            {habit.streak}d clear
          </span>
        ) : null}
      </div>
      <div
        className="flex flex-wrap gap-2 pl-9"
        role="group"
        aria-label={`${habit.name} drink amount`}
      >
        {DRINK_TIERS.map((option) => {
          const selected = tier === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(selected ? null : option.id)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                selected
                  ? "border-[color:var(--color-stress)] bg-[color:var(--color-stress)] text-[#0e0e0e]"
                  : "border-border text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChecklistSection({
  title,
  caption,
  habits,
  done,
  drinkTiers,
  onToggle,
  onDrinkTier,
}: {
  title: string;
  caption: string;
  habits: HabitRow[];
  done: Record<string, boolean>;
  drinkTiers: Record<string, DrinkTier | null>;
  onToggle: (id: string) => void;
  onDrinkTier: (id: string, tier: DrinkTier | null) => void;
}) {
  if (habits.length === 0) return null;

  return (
    <div className="space-y-2">
      <div>
        <h2 className="metric-label">{title}</h2>
        <p className="snapshot-caption mt-0.5">{caption}</p>
      </div>
      <Card className="divide-border divide-y p-0">
        {habits.map((h) =>
          isDrinkQuantityHabit(h) ? (
            <DrinkTagRow
              key={h.id}
              habit={h}
              tier={drinkTiers[h.id] ?? null}
              logged={done[h.id]}
              onSelect={(tier) => onDrinkTier(h.id, tier)}
            />
          ) : (
            <HabitRowButton
              key={h.id}
              habit={h}
              checked={done[h.id]}
              onToggle={() => onToggle(h.id)}
            />
          ),
        )}
      </Card>
    </div>
  );
}

/** Daily habits (do this) + day tags (log if it happened). */
export function HabitChecklist({
  habits,
  logDate,
}: {
  habits: HabitRow[];
  logDate: string;
}) {
  const positive = habits.filter((h) => h.kind === "positive");
  const track = habits.filter((h) => h.kind === "track");

  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(habits.map((h) => [h.id, h.completed])),
  );
  const [drinkTiers, setDrinkTiers] = useState<Record<string, DrinkTier | null>>(
    () => Object.fromEntries(habits.map((h) => [h.id, h.amountTier])),
  );
  const [, startTransition] = useTransition();

  const stateKey = rowStateKey(habits);
  useEffect(() => {
    setDone(Object.fromEntries(habits.map((h) => [h.id, h.completed])));
    setDrinkTiers(Object.fromEntries(habits.map((h) => [h.id, h.amountTier])));
  }, [logDate, stateKey, habits]);

  function toggle(id: string) {
    const next = !done[id];
    setDone((d) => ({ ...d, [id]: next }));
    startTransition(async () => {
      await toggleHabit(id, logDate, next);
    });
  }

  function setDrinkTier(id: string, tier: DrinkTier | null) {
    setDrinkTiers((t) => ({ ...t, [id]: tier }));
    setDone((d) => ({ ...d, [id]: tier != null }));
    startTransition(async () => {
      await setHabitDrinkTier(id, logDate, tier);
    });
  }

  if (habits.length === 0) {
    return (
      <Card>
        <p className="body-copy text-sm">
          Add habits you want to build, or day tags to log things like alcohol,
          late meals, or anything else worth tracking.
        </p>
      </Card>
    );
  }

  return (
    <div key={logDate} className="space-y-6">
      <ChecklistSection
        title="Habits"
        caption="Tap when you did it — streaks count consecutive days."
        habits={positive}
        done={done}
        drinkTiers={drinkTiers}
        onToggle={toggle}
        onDrinkTier={setDrinkTier}
      />
      <ChecklistSection
        title="Day tags"
        caption="Tap a bucket for alcohol, or tap other tags if they happened."
        habits={track}
        done={done}
        drinkTiers={drinkTiers}
        onToggle={toggle}
        onDrinkTier={setDrinkTier}
      />
    </div>
  );
}
