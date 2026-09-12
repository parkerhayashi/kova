"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Flame, Minus, Plus, Shield } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  setHabitDrinkCount,
  toggleHabit,
} from "@/app/(dashboard)/habits/actions";
import {
  MAX_DRINKS,
  formatDrinkCount,
  isDrinkQuantityHabit,
} from "@/lib/habit-drinks";
import type { HabitKind } from "@/types";

export interface HabitRow {
  id: string;
  name: string;
  kind: HabitKind;
  completed: boolean;
  drinkCount: number | null;
  streak: number;
  weekRate: number;
}

function rowStateKey(habits: HabitRow[]): string {
  return habits
    .map((h) => `${h.id}:${h.completed ? 1 : 0}:${h.drinkCount ?? ""}`)
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
  count,
  onChange,
}: {
  habit: HabitRow;
  count: number | null;
  onChange: (count: number | null) => void;
}) {
  const label = formatDrinkCount(count);
  const active = count != null && count > 0;

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
        ) : null}
        {habit.streak > 0 ? (
          <span className="text-text-muted inline-flex items-center gap-1 text-xs">
            <Shield className="size-3.5" strokeWidth={1.5} />
            {habit.streak}d clear
          </span>
        ) : null}
      </div>
      <div
        className="flex items-center gap-3 pl-9"
        role="group"
        aria-label={`${habit.name} drink count`}
      >
        <button
          type="button"
          disabled={!count}
          aria-label="Fewer drinks"
          onClick={() => onChange((count ?? 1) - 1)}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-40",
            "border-border text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]",
          )}
        >
          <Minus className="size-3.5" />
        </button>
        <span className="min-w-[2rem] text-center text-sm font-semibold tabular-nums text-text-primary">
          {count ?? 0}
        </span>
        <button
          type="button"
          disabled={(count ?? 0) >= MAX_DRINKS}
          aria-label="More drinks"
          onClick={() => onChange((count ?? 0) + 1)}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-40",
            "border-border text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]",
          )}
        >
          <Plus className="size-3.5" />
        </button>
        {count ? (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-text-muted hover:text-text-primary text-xs underline-offset-2 hover:underline"
          >
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ChecklistSection({
  title,
  caption,
  habits,
  done,
  drinkCounts,
  onToggle,
  onDrinkCount,
}: {
  title: string;
  caption: string;
  habits: HabitRow[];
  done: Record<string, boolean>;
  drinkCounts: Record<string, number | null>;
  onToggle: (id: string) => void;
  onDrinkCount: (id: string, count: number | null) => void;
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
              count={drinkCounts[h.id] ?? null}
              onChange={(count) => onDrinkCount(h.id, count)}
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
  const [drinkCounts, setDrinkCounts] = useState<Record<string, number | null>>(
    () => Object.fromEntries(habits.map((h) => [h.id, h.drinkCount])),
  );
  const [, startTransition] = useTransition();
  const router = useRouter();

  const stateKey = rowStateKey(habits);
  useEffect(() => {
    setDone(Object.fromEntries(habits.map((h) => [h.id, h.completed])));
    setDrinkCounts(Object.fromEntries(habits.map((h) => [h.id, h.drinkCount])));
  }, [logDate, stateKey, habits]);

  function toggle(id: string) {
    const next = !done[id];
    setDone((d) => ({ ...d, [id]: next }));
    startTransition(async () => {
      await toggleHabit(id, logDate, next);
      router.refresh();
    });
  }

  function setDrinkCount(id: string, count: number | null) {
    const next =
      count == null || count <= 0 ? null : Math.min(MAX_DRINKS, count);
    setDrinkCounts((t) => ({ ...t, [id]: next }));
    setDone((d) => ({ ...d, [id]: next != null }));
    startTransition(async () => {
      await setHabitDrinkCount(id, logDate, next);
      router.refresh();
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
        drinkCounts={drinkCounts}
        onToggle={toggle}
        onDrinkCount={setDrinkCount}
      />
      <ChecklistSection
        title="Day tags"
        caption="Set an exact drink count for alcohol, or tap other tags if they happened."
        habits={track}
        done={done}
        drinkCounts={drinkCounts}
        onToggle={toggle}
        onDrinkCount={setDrinkCount}
      />
    </div>
  );
}
