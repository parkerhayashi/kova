"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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
  const logDateRef = useRef(logDate);
  const [weight, setWeight] = useState(
    () => (initialWeightLbs != null ? String(initialWeightLbs) : ""),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    logDateRef.current = logDate;
  }, [logDate]);

  useEffect(() => {
    setWeight(initialWeightLbs != null ? String(initialWeightLbs) : "");
    setError(null);
  }, [logDate, initialWeightLbs]);

  const heading = logDateHeading(logDate, today, timezone);

  function save() {
    const n = Number(weight);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a valid weight in pounds.");
      return;
    }
    // Capture the day at click time so a late date-picker change can't steal the write.
    const date = logDateRef.current;
    setError(null);
    startTransition(async () => {
      const forToday = date === today;
      const res = await fetch("/api/weight/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: forToday ? undefined : date,
          forToday,
          weight: n,
          unit: "lb",
        }),
      });
      if (!res.ok) {
        setError("Could not save weight.");
        return;
      }
      const json = (await res.json().catch(() => null)) as { date?: string } | null;
      if (!forToday && json?.date && json.date !== date) {
        setError(`Saved to ${json.date} instead of ${date}. Try again.`);
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
