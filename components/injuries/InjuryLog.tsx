"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  checkInInjuryAction,
  deleteInjuryAction,
  saveInjuryAction,
  setInjuryStatusAction,
} from "@/app/(dashboard)/injuries/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Input";
import type { InjuryView } from "@/lib/data/injuries";
import {
  AGGRAVATORS,
  aggravatorLabel,
  BODY_PARTS,
  INJURY_TYPES,
  injuryGuidance,
  injuryName,
  injuryTypeLabel,
  needsProfessional,
  RED_FLAGS,
  redFlagLabel,
} from "@/lib/injuries";
import { cn, formatIsoDateLabel } from "@/lib/utils";
import type { InjurySide } from "@/types";

/** Severity is data — color runs from recovery green to stress red. */
export function severityColor(s: number): string {
  if (s <= 2) return "var(--color-recovery)";
  if (s <= 4) return "var(--color-activity)";
  if (s <= 6) return "var(--color-nutrition)";
  return "var(--color-stress)";
}

function useAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<void>, onDone?: () => void) => {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        onDone?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        router.refresh();
      }
    });
  };
  return { pending, error, run };
}

/** 0–10 tap row for today's level. */
export function SeverityPicker({
  value,
  onPick,
  disabled,
}: {
  value: number | null;
  onPick: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-11 gap-1">
      {Array.from({ length: 11 }, (_, n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onPick(n)}
          aria-label={`Severity ${n}`}
          aria-pressed={value === n}
          className={cn(
            "border-border rounded-md border py-1.5 text-xs tabular-nums transition-colors disabled:opacity-50",
            value === n ? "border-border-strong bg-[rgba(255,255,255,0.1)] text-text-primary" : "text-text-secondary hover:bg-[rgba(255,255,255,0.04)]",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

function Chips({
  options,
  selected,
  onToggle,
}: {
  options: { key: string; label: string }[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onToggle(o.key)}
          aria-pressed={selected.includes(o.key)}
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs transition-colors",
            selected.includes(o.key)
              ? "border-border-strong bg-[rgba(255,255,255,0.1)] text-text-primary"
              : "border-border text-text-secondary hover:bg-[rgba(255,255,255,0.04)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Log a new injury / pain. */
export function InjuryForm({ onDone }: { onDone?: () => void }) {
  const { pending, error, run } = useAction();
  const [bodyPart, setBodyPart] = useState("knee");
  const [side, setSide] = useState<InjurySide>("left");
  const [type, setType] = useState("dull_ache");
  const [severity, setSeverity] = useState<number | null>(null);
  const [onset, setOnset] = useState("");
  const [aggravators, setAggravators] = useState<string[]>([]);
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const toggle = (list: string[], set: (v: string[]) => void) => (key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  return (
    <Card className="space-y-4">
      <span className="metric-label">Log an injury or pain</span>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Body part">
          <Select value={bodyPart} onChange={(e) => setBodyPart(e.target.value)}>
            {BODY_PARTS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Side">
          <Select value={side} onChange={(e) => setSide(e.target.value as InjurySide)}>
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="both">Both</option>
            <option value="none">N/A</option>
          </Select>
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {INJURY_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="space-y-1.5">
        <span className="metric-label">How bad? (0 = none, 10 = worst)</span>
        <SeverityPicker value={severity} onPick={setSeverity} />
      </div>
      <Field label="Started (optional, default today)" className="max-w-[14rem]">
        <Input type="date" value={onset} onChange={(e) => setOnset(e.target.value)} />
      </Field>
      <div className="space-y-1.5">
        <span className="metric-label">Worse with</span>
        <Chips options={AGGRAVATORS} selected={aggravators} onToggle={toggle(aggravators, setAggravators)} />
      </div>
      <div className="space-y-1.5">
        <span className="metric-label">Any of these?</span>
        <Chips options={RED_FLAGS} selected={symptoms} onToggle={toggle(symptoms, setSymptoms)} />
      </div>
      <Field label="Notes (optional)">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. outside of knee, after the long run" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={pending || severity == null}
          onClick={() =>
            run(
              () =>
                saveInjuryAction({
                  body_part: bodyPart,
                  side,
                  injury_type: type,
                  severity: severity ?? 0,
                  onset_date: onset || undefined,
                  aggravators,
                  symptoms,
                  notes,
                }),
              onDone,
            )
          }
        >
          {pending ? "Saving…" : "Log it"}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-text-secondary text-sm">{error}</p> : null}
    </Card>
  );
}

/** One injury: today's check-in, trend, guidance. */
export function InjuryCard({ view, today }: { view: InjuryView; today: string }) {
  const { pending, error, run } = useAction();
  const { injury, checkins, severity } = view;
  const todays = checkins.find((c) => c.date === today)?.severity ?? null;
  const resolved = injury.status === "resolved";
  const days = Math.max(
    0,
    Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${injury.onset_date}T12:00:00Z`)) / 86_400_000),
  );
  const trend = [{ date: injury.onset_date, severity: injury.severity }, ...checkins.filter((c) => c.date !== injury.onset_date)].slice(-14);

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{injuryName(injury)}</p>
          <p className="text-text-muted text-xs">
            {injuryTypeLabel(injury.injury_type)} · since {formatIsoDateLabel(injury.onset_date)} ({days} day
            {days === 1 ? "" : "s"}) · {injury.status}
          </p>
        </div>
        <span className="text-2xl font-bold tabular-nums" style={{ color: severityColor(severity) }}>
          {severity}
          <span className="text-text-muted text-sm font-normal">/10</span>
        </span>
      </div>

      {/* Severity trend — data bars, colored by level. */}
      {trend.length > 1 ? (
        <div className="flex h-8 items-end gap-1" aria-label="Severity trend">
          {trend.map((p, i) => (
            <div
              key={i}
              title={`${formatIsoDateLabel(p.date)}: ${p.severity}/10`}
              className="flex-1 rounded-sm"
              style={{ height: `${Math.max(8, p.severity * 10)}%`, background: severityColor(p.severity) }}
            />
          ))}
        </div>
      ) : null}

      {!resolved ? (
        <>
          <div className="space-y-1.5">
            <span className="metric-label">{todays != null ? "Today (tap to change)" : "How is it today?"}</span>
            <SeverityPicker
              value={todays}
              disabled={pending}
              onPick={(n) => run(() => checkInInjuryAction({ injury_id: injury.id, severity: n }))}
            />
          </div>
          <p className={cn("text-sm", needsProfessional(injury, severity) ? "text-text-primary" : "text-text-secondary")}>
            {injuryGuidance(injury, severity)}
          </p>
          {injury.symptoms.length > 0 ? (
            <p className="text-text-muted text-xs">Flags: {injury.symptoms.map(redFlagLabel).join(", ")}</p>
          ) : null}
        </>
      ) : null}
      {injury.aggravators.length > 0 ? (
        <p className="text-text-muted text-xs">Worse with: {injury.aggravators.map(aggravatorLabel).join(", ")}</p>
      ) : null}
      {injury.notes ? <p className="text-text-muted text-xs">{injury.notes}</p> : null}

      <div className="flex flex-wrap gap-2">
        {!resolved ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => setInjuryStatusAction(injury.id, "resolved"))}>
            Mark resolved
          </Button>
        ) : (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => setInjuryStatusAction(injury.id, "active"))}>
            Reopen
          </Button>
        )}
        <Button type="button" variant="danger" disabled={pending} onClick={() => run(() => deleteInjuryAction(injury.id))}>
          Delete
        </Button>
      </div>
      {error ? <p className="text-text-secondary text-sm">{error}</p> : null}
    </Card>
  );
}

/** Home prompt: one tap per active injury not yet checked in today. */
export function InjuryCheckinPrompt({ views }: { views: InjuryView[] }) {
  const { pending, run } = useAction();
  const due = views.filter((v) => !v.checkedInToday && v.injury.status !== "resolved");
  if (due.length === 0) return null;
  return (
    <div className="dash-card space-y-3" style={{ padding: 16, marginBottom: 10 }}>
      {due.map((v) => (
        <div key={v.injury.id} className="space-y-1.5">
          <span className="metric-label">{injuryName(v.injury)} — how is it today?</span>
          <SeverityPicker
            value={null}
            disabled={pending}
            onPick={(n) => run(() => checkInInjuryAction({ injury_id: v.injury.id, severity: n }))}
          />
        </div>
      ))}
    </div>
  );
}

/** The page body: log button + active list. */
export function InjuryLog({ active, today }: { active: InjuryView[]; today: string }) {
  const [adding, setAdding] = useState(active.length === 0);
  return (
    <div className="space-y-4">
      {adding ? (
        <InjuryForm onDone={active.length ? () => setAdding(false) : undefined} />
      ) : (
        <Button type="button" variant="solid" onClick={() => setAdding(true)}>
          Log an injury or pain
        </Button>
      )}
      {active.map((v) => (
        <InjuryCard key={v.injury.id} view={v} today={today} />
      ))}
    </div>
  );
}
