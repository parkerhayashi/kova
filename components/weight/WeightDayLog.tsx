"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { logDateHeading } from "@/lib/log-date";

export function WeightDayLog({
  logDate,
  today,
  timezone,
  initialWeightLbs,
}: {
  logDate: string;
  today: string;
  timezone: string;
  initialWeightLbs: number | null;
}) {
  const router = useRouter();
  const [weight, setWeight] = useState(
    initialWeightLbs != null ? String(initialWeightLbs) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const heading = logDateHeading(logDate, today, timezone);

  function save() {
    const n = Number(weight);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a valid weight in pounds.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/weight/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: logDate, weight: n, unit: "lb" }),
      });
      if (!res.ok) {
        setError("Could not save weight.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <div>
        <span className="metric-label">Weight</span>
        <p className="snapshot-caption mt-0.5">
          Log body weight for {heading.toLowerCase()}.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Weight (lb)" className="min-w-[8rem] flex-1">
          <Input
            type="number"
            inputMode="decimal"
            step="0.1"
            placeholder="—"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </Field>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      {error ? <p className="text-xs text-[var(--color-stress)]">{error}</p> : null}
    </Card>
  );
}
