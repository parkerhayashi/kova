"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { saveWeight } from "@/app/(dashboard)/weight/actions";

interface WeightFormProps {
  defaultDate: string;
  initial?: { weight_lbs: number; body_fat_pct: number | null; notes: string | null };
}

/** Daily weight entry — upserts on date, so re-submitting a day overwrites it. */
export function WeightForm({ defaultDate, initial }: WeightFormProps) {
  const [date, setDate] = useState(defaultDate);
  const [weight, setWeight] = useState(initial?.weight_lbs?.toString() ?? "");
  const [bodyFat, setBodyFat] = useState(initial?.body_fat_pct?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const weight_lbs = Number(weight);
    if (!weight_lbs || weight_lbs <= 0) return;
    startTransition(async () => {
      await saveWeight({
        date,
        weight_lbs,
        body_fat_pct: bodyFat ? Number(bodyFat) : null,
        notes: notes.trim() || null,
      });
    });
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Date">
            <Input type="date" value={date} max={defaultDate} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Weight (lbs)">
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="178.4"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
          </Field>
          <Field label="Body Fat %">
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              placeholder="optional"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
            />
          </Field>
          <Field label="Notes" className="col-span-2 sm:col-span-1">
            <Input
              type="text"
              placeholder="optional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </div>
        <Button type="submit" disabled={pending || !weight}>
          {pending ? "Saving…" : "Log weight"}
        </Button>
      </form>
    </Card>
  );
}
