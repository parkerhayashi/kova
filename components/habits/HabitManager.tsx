"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { Habit } from "@/types";
import {
  archiveHabit,
  createHabit,
  renameHabit,
  reorderHabits,
} from "@/app/(dashboard)/habits/actions";

/** Add, rename, reorder, and archive habits. Collapsed by default. */
export function HabitManager({ habits }: { habits: Habit[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [order, setOrder] = useState(habits);
  const [, startTransition] = useTransition();

  // Re-sync local order whenever the server list changes (add/archive/rename).
  const idKey = habits.map((h) => h.id).join();
  useEffect(() => {
    setOrder(habits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const value = name;
    setName("");
    startTransition(async () => {
      await createHabit(value);
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
        {open ? "Manage habits ▴" : "Manage habits ▾"}
      </button>

      {open ? (
        <div className="space-y-4">
          <form onSubmit={add} className="flex gap-2">
            <Input
              placeholder="New habit (e.g. Read 20 min)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button type="submit" disabled={!name.trim()}>
              <Plus className="size-4" /> Add
            </Button>
          </form>

          <ul className="divide-border divide-y">
            {order.map((h, i) => (
              <li key={h.id} className="flex items-center gap-2 py-2">
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
                  aria-label="Archive habit"
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
