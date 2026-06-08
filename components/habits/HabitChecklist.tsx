"use client";

import { useState, useTransition } from "react";
import { Check, Flame } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { toggleHabit } from "@/app/(dashboard)/habits/actions";

export interface HabitRow {
  id: string;
  name: string;
  completed: boolean;
  streak: number;
  weekRate: number;
}

/** Today's habit checklist — one tap to toggle, optimistic with a streak badge. */
export function HabitChecklist({
  habits,
  today,
}: {
  habits: HabitRow[];
  today: string;
}) {
  const [done, setDone] = useState<Record<string, boolean>>(
    Object.fromEntries(habits.map((h) => [h.id, h.completed])),
  );
  const [, startTransition] = useTransition();

  function toggle(id: string) {
    const next = !done[id];
    setDone((d) => ({ ...d, [id]: next }));
    startTransition(async () => {
      await toggleHabit(id, today, next);
    });
  }

  if (habits.length === 0) {
    return (
      <Card>
        <p className="body-copy text-sm">
          No active habits yet. Add one below to start your checklist.
        </p>
      </Card>
    );
  }

  return (
    <Card className="divide-border divide-y p-0">
      {habits.map((h) => {
        const checked = done[h.id];
        return (
          <button
            key={h.id}
            onClick={() => toggle(h.id)}
            className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.03)]"
          >
            <span
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                checked
                  ? "border-transparent bg-[color:var(--color-recovery)]"
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
              {h.name}
            </span>
            {h.streak > 0 ? (
              <span className="text-text-muted inline-flex items-center gap-1 text-xs">
                <Flame className="size-3.5" strokeWidth={1.5} />
                {h.streak}
              </span>
            ) : null}
            <span className="timestamp w-10 text-right">
              {Math.round(h.weekRate * 100)}%
            </span>
          </button>
        );
      })}
    </Card>
  );
}
