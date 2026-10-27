"use client";

import { useState, useTransition } from "react";
import { Check, ChevronDown, Flame } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { notifyTopBar } from "@/lib/top-bar-events";
import { cn } from "@/lib/utils";
import {
  logSupplementDetail,
  toggleSupplement,
} from "@/app/(dashboard)/supplements/actions";

export interface SupplementRow {
  id: string;
  name: string;
  unit: string | null;
  defaultDose: number | null;
  taken: boolean;
  doseTaken: number | null;
  timeTaken: string | null;
  notes: string | null;
  streak: number;
  rate30: number;
}

function doseLabel(dose: number | null, unit: string | null): string | null {
  if (dose == null) return null;
  return unit ? `${dose} ${unit}` : `${dose}`;
}

function DetailPanel({ row, logDate }: { row: SupplementRow; logDate: string }) {
  const [dose, setDose] = useState(
    (row.doseTaken ?? row.defaultDose)?.toString() ?? "",
  );
  const [time, setTime] = useState(row.timeTaken?.slice(0, 5) ?? "");
  const [notes, setNotes] = useState(row.notes ?? "");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      await logSupplementDetail({
        supplementId: row.id,
        date: logDate,
        dose_taken: dose ? Number(dose) : null,
        time_taken: time || null,
        notes: notes.trim() || null,
      });
      notifyTopBar();
    });
  }

  return (
    <div className="bg-[rgba(255,255,255,0.02)] px-5 py-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label={`Dose${row.unit ? ` (${row.unit})` : ""}`}>
          <Input
            type="number"
            inputMode="decimal"
            step="any"
            value={dose}
            onChange={(e) => setDose(e.target.value)}
          />
        </Field>
        <Field label="Time">
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Notes" className="col-span-2">
          <Input
            type="text"
            placeholder="optional"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-3">
        <Button variant="ghost" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </div>
  );
}

/** Daily supplement checklist — tap to mark taken; expand for dose/time/notes. */
export function SupplementChecklist({
  supplements,
  logDate,
}: {
  supplements: SupplementRow[];
  logDate: string;
}) {
  const [taken, setTaken] = useState<Record<string, boolean>>(
    Object.fromEntries(supplements.map((s) => [s.id, s.taken])),
  );
  const [expanded, setExpanded] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggle(id: string) {
    const next = !taken[id];
    setTaken((t) => ({ ...t, [id]: next }));
    startTransition(async () => {
      await toggleSupplement(id, logDate, next);
      notifyTopBar();
    });
  }

  if (supplements.length === 0) {
    return (
      <Card>
        <p className="body-copy text-sm">
          No active supplements yet. Add one below to start your stack.
        </p>
      </Card>
    );
  }

  return (
    <Card className="divide-border divide-y p-0">
      {supplements.map((s) => {
        const checked = taken[s.id];
        const dose = doseLabel(s.doseTaken ?? s.defaultDose, s.unit);
        return (
          <div key={s.id}>
            <div className="flex items-center gap-3 px-5 py-3.5">
              <button
                onClick={() => toggle(s.id)}
                aria-label={`Mark ${s.name} taken`}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                  checked
                    ? "border-transparent bg-[color:var(--color-nutrition)]"
                    : "border-border-strong",
                )}
              >
                {checked ? (
                  <Check className="size-4 text-[#0e0e0e]" strokeWidth={3} />
                ) : null}
              </button>
              <button
                onClick={() => toggle(s.id)}
                className="flex-1 text-left"
              >
                <span
                  className={cn(
                    "text-sm",
                    checked ? "text-text-primary" : "text-text-secondary",
                  )}
                >
                  {s.name}
                </span>
                {dose ? (
                  <span className="text-text-muted ml-2 text-xs">{dose}</span>
                ) : null}
              </button>
              {s.streak > 0 ? (
                <span className="text-text-muted inline-flex items-center gap-1 text-xs">
                  <Flame className="size-3.5" strokeWidth={1.5} />
                  {s.streak}
                </span>
              ) : null}
              <span className="timestamp w-10 text-right">
                {Math.round(s.rate30 * 100)}%
              </span>
              <button
                onClick={() => setExpanded((e) => (e === s.id ? null : s.id))}
                aria-label="Log details"
                className="text-text-muted hover:text-text-primary"
              >
                <ChevronDown
                  className={cn(
                    "size-4 transition-transform",
                    expanded === s.id && "rotate-180",
                  )}
                />
              </button>
            </div>
            {expanded === s.id ? <DetailPanel row={s} logDate={logDate} /> : null}
          </div>
        );
      })}
    </Card>
  );
}
