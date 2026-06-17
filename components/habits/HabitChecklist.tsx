"use client";

import { useEffect, useState, useTransition } from "react";
import { Check, Flame, Shield } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { toggleHabit } from "@/app/(dashboard)/habits/actions";
import type { HabitKind } from "@/types";

export interface HabitRow {
  id: string;
  name: string;
  kind: HabitKind;
  completed: boolean;
  streak: number;
  weekRate: number;
}

function completionKey(habits: HabitRow[]): string {
  return habits.map((h) => `${h.id}:${h.completed ? 1 : 0}`).join("|");
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

function ChecklistSection({
  title,
  caption,
  habits,
  done,
  onToggle,
}: {
  title: string;
  caption: string;
  habits: HabitRow[];
  done: Record<string, boolean>;
  onToggle: (id: string) => void;
}) {
  if (habits.length === 0) return null;

  return (
    <div className="space-y-2">
      <div>
        <h2 className="metric-label">{title}</h2>
        <p className="snapshot-caption mt-0.5">{caption}</p>
      </div>
      <Card className="divide-border divide-y p-0">
        {habits.map((h) => (
          <HabitRowButton
            key={h.id}
            habit={h}
            checked={done[h.id]}
            onToggle={() => onToggle(h.id)}
          />
        ))}
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
  const [, startTransition] = useTransition();

  const habitKey = completionKey(habits);
  useEffect(() => {
    setDone(Object.fromEntries(habits.map((h) => [h.id, h.completed])));
  }, [logDate, habitKey, habits]);

  function toggle(id: string) {
    const next = !done[id];
    setDone((d) => ({ ...d, [id]: next }));
    startTransition(async () => {
      await toggleHabit(id, logDate, next);
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
        onToggle={toggle}
      />
      <ChecklistSection
        title="Day tags"
        caption="Tap if it happened that day — streaks count clear days without it."
        habits={track}
        done={done}
        onToggle={toggle}
      />
    </div>
  );
}
