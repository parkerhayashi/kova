"use client";

import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import type { Supplement } from "@/types";
import {
  archiveSupplement,
  createSupplement,
  editSupplement,
  reorderSupplements,
} from "@/app/(dashboard)/supplements/actions";

/** Add, edit, reorder, and archive supplements with default dose + unit. */
export function SupplementManager({ supplements }: { supplements: Supplement[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [unit, setUnit] = useState("");
  const [order, setOrder] = useState(supplements);
  const [, startTransition] = useTransition();

  const idKey = supplements.map((s) => s.id).join();
  useEffect(() => {
    setOrder(supplements);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name,
      default_dose: dose ? Number(dose) : null,
      unit: unit.trim() || null,
      notes: null,
    };
    setName("");
    setDose("");
    setUnit("");
    startTransition(async () => {
      await createSupplement(payload);
    });
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    startTransition(async () => {
      await reorderSupplements(next.map((s) => s.id));
    });
  }

  return (
    <Card className="space-y-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="metric-label hover:text-text-secondary w-full text-left"
      >
        {open ? "Manage supplements ▴" : "Manage supplements ▾"}
      </button>

      {open ? (
        <div className="space-y-4">
          <form onSubmit={add} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Name" className="col-span-2 sm:col-span-2">
              <Input
                placeholder="e.g. Vitamin D3"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Dose">
              <Input
                type="number"
                inputMode="decimal"
                step="any"
                placeholder="5000"
                value={dose}
                onChange={(e) => setDose(e.target.value)}
              />
            </Field>
            <Field label="Unit">
              <Input
                placeholder="IU"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </Field>
            <div className="col-span-2 sm:col-span-4">
              <Button type="submit" disabled={!name.trim()}>
                <Plus className="size-4" /> Add supplement
              </Button>
            </div>
          </form>

          <ul className="divide-border divide-y">
            {order.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2 py-2">
                <Input
                  className="flex-1"
                  defaultValue={s.name}
                  onBlur={(e) => {
                    if (e.target.value.trim() && e.target.value !== s.name) {
                      const v = e.target.value;
                      startTransition(async () => {
                        await editSupplement(s.id, { name: v });
                      });
                    }
                  }}
                />
                <Input
                  className="w-20"
                  type="number"
                  step="any"
                  defaultValue={s.default_dose?.toString() ?? ""}
                  placeholder="dose"
                  onBlur={(e) => {
                    const v = e.target.value ? Number(e.target.value) : null;
                    if (v !== s.default_dose)
                      startTransition(async () => {
                        await editSupplement(s.id, { default_dose: v });
                      });
                  }}
                />
                <Input
                  className="w-16"
                  defaultValue={s.unit ?? ""}
                  placeholder="unit"
                  onBlur={(e) => {
                    const v = e.target.value.trim() || null;
                    if (v !== s.unit)
                      startTransition(async () => {
                        await editSupplement(s.id, { unit: v });
                      });
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
                      await archiveSupplement(s.id);
                    })
                  }
                  className="text-text-muted hover:text-[color:var(--color-stress)]"
                  aria-label="Archive supplement"
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
