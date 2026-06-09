"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import type { Supplement } from "@/types";
import {
  searchSupplements,
  type SupplementPreset,
} from "@/lib/supplementCatalog";
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
  const [note, setNote] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [order, setOrder] = useState(supplements);
  const [, startTransition] = useTransition();
  const nameWrapRef = useRef<HTMLDivElement>(null);

  const matches = showResults ? searchSupplements(name) : [];

  const idKey = supplements.map((s) => s.id).join();
  useEffect(() => {
    setOrder(supplements);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  // Close the autocomplete on an outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!nameWrapRef.current?.contains(e.target as Node)) setShowResults(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(preset: SupplementPreset) {
    setName(preset.name);
    setDose(String(preset.dose));
    setUnit(preset.unit);
    setNote(preset.note);
    setShowResults(false);
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const payload = {
      name,
      default_dose: dose ? Number(dose) : null,
      unit: unit.trim() || null,
      notes: note.trim() || null,
    };
    setName("");
    setDose("");
    setUnit("");
    setNote("");
    setShowResults(false);
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
            <div
              ref={nameWrapRef}
              className="relative col-span-2 flex flex-col gap-1.5 sm:col-span-2"
            >
              <span className="metric-label">Name</span>
              <div className="relative">
                <Search
                  className="text-text-muted pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
                  strokeWidth={1.5}
                />
                <Input
                  className="pl-9"
                  placeholder="Search e.g. Vitamin D3"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setShowResults(true);
                    setNote("");
                  }}
                  onFocus={() => {
                    if (name.trim()) setShowResults(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setShowResults(false);
                    if (e.key === "Enter" && matches.length > 0) {
                      e.preventDefault();
                      pick(matches[0]);
                    }
                  }}
                />
              </div>
              {matches.length > 0 ? (
                <ul className="border-border bg-surface-raised absolute top-full z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border py-1 shadow-xl">
                  {matches.map((m) => (
                    <li key={m.name}>
                      <button
                        type="button"
                        onClick={() => pick(m)}
                        className="hover:bg-[rgba(255,255,255,0.05)] flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left"
                      >
                        <span className="text-text-primary text-sm">{m.name}</span>
                        <span className="text-text-muted shrink-0 text-xs">
                          {m.dose} {m.unit}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
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
            <Field label="Note / timing" className="col-span-2 sm:col-span-4">
              <Input
                placeholder="e.g. Morning, with food"
                value={note}
                onChange={(e) => setNote(e.target.value)}
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
