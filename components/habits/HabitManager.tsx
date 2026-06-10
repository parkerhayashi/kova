"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Habit, HabitKind } from "@/types";
import {
  archiveHabit,
  createHabit,
  renameHabit,
  reorderHabits,
} from "@/app/(dashboard)/habits/actions";
import { cn } from "@/lib/utils";

const KIND_OPTIONS: { value: HabitKind; label: string; placeholder: string }[] =
  [
    {
      value: "positive",
      label: "Habit",
      placeholder: "e.g. Read 20 min",
    },
    {
      value: "track",
      label: "Day tag",
      placeholder: "e.g. Alcohol",
    },
  ];

function KindToggle({
  value,
  onChange,
}: {
  value: HabitKind;
  onChange: (kind: HabitKind) => void;
}) {
  return (
    <div className="border-border flex shrink-0 rounded-lg border p-0.5">
      {KIND_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            value === opt.value
              ? "bg-[rgba(255,255,255,0.08)] text-text-primary"
              : "text-text-muted hover:text-text-secondary",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Add, rename, reorder, and archive habits and day tags. */
export function HabitManager({ habits }: { habits: Habit[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<HabitKind>("positive");
  const [order, setOrder] = useState(habits);
  const [, startTransition] = useTransition();

  const idKey = habits.map((h) => h.id).join();
  useEffect(() => {
    setOrder(habits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  const placeholder =
    KIND_OPTIONS.find((o) => o.value === kind)?.placeholder ?? "Name";

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const value = name;
    const nextKind = kind;
    setName("");
    startTransition(async () => {
      await createHabit(value, nextKind);
    });
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    startTransition(async () => {
      await reorderHabits(next.map((h) => h.id));
    });
  }

  return (
    <Card className="space-y-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="metric-label hover:text-text-secondary w-full text-left"
      >
        {open ? "Manage ▴" : "Manage ▾"}
      </button>

      {open ? (
        <div className="space-y-4">
          <form onSubmit={add} className="flex flex-wrap gap-2">
            <Input
              className="min-w-[12rem] flex-1"
              placeholder={placeholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <KindToggle value={kind} onChange={setKind} />
            <Button type="submit" disabled={!name.trim()}>
              <Plus className="size-4" /> Add
            </Button>
          </form>

          <ul className="divide-border divide-y">
            {order.map((h, i) => (
              <li key={h.id} className="flex items-center gap-2 py-2">
                <span
                  className={cn(
                    "timestamp w-14 shrink-0 text-left",
                    h.kind === "track" ? "text-[color:var(--color-stress)]" : "",
                  )}
                >
                  {h.kind === "track" ? "tag" : "habit"}
                </span>
                <Input
                  defaultValue={h.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== h.name) {
                      const v = e.target.value;
                      startTransition(async () => {
                        await renameHabit(h.id, v);
                      });
                    }
                  }}
                />
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-text-muted hover:text-text-primary disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ArrowUp className="size-4" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === order.length - 1}
                  className="text-text-muted hover:text-text-primary disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ArrowDown className="size-4" />
                </button>
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await archiveHabit(h.id);
                    })
                  }
                  className="text-text-muted hover:text-[color:var(--color-stress)]"
                  aria-label="Archive"
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
