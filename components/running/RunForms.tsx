"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addMidRunIntakeAction,
  designateRunAction,
  saveActualRunAction,
  saveRaceAction,
  saveTrainingPlanRunAction,
} from "@/app/(dashboard)/running/actions";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Input";
import {
  estimateDurationMin,
  formatRunDuration,
  GEL_DEFAULT,
  kmToMiles,
  milesToKm,
  qualifiesForFueling,
  RACE_EVENTS,
  RUN_TYPES,
  runTypeLabel,
} from "@/lib/run-fuel";
import type { RaceEventType, RunType } from "@/types";

/** Run a server action, refresh the route, surface errors inline. */
export function useRunAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run<T>(fn: () => Promise<T>, onDone?: (result: T) => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await fn();
        router.refresh();
        onDone?.(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  }
  return { pending, error, run };
}

export function FormError({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p className="text-xs" style={{ color: "var(--color-stress)" }}>
      {error}
    </p>
  );
}

type Unit = "mi" | "km";

function parseNum(raw: string): number | null {
  const n = Number(raw);
  return raw.trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

function toKm(raw: string, unit: Unit): number | null {
  const n = parseNum(raw);
  if (n == null) return null;
  return unit === "mi" ? milesToKm(n) : n;
}

function fromKm(km: number | null | undefined): string {
  return km != null ? String(Math.round(kmToMiles(km) * 100) / 100) : "";
}

function DistanceField({
  value,
  unit,
  onValue,
  onUnit,
  label = "Distance",
}: {
  value: string;
  unit: Unit;
  onValue: (v: string) => void;
  onUnit: (u: Unit) => void;
  label?: string;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <Input
          inputMode="decimal"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          placeholder="0"
        />
        <Select
          value={unit}
          onChange={(e) => onUnit(e.target.value as Unit)}
          className="w-20 shrink-0"
          aria-label="Distance unit"
        >
          <option value="mi">mi</option>
          <option value="km">km</option>
        </Select>
      </div>
    </Field>
  );
}

const TRAINING_TYPES = RUN_TYPES as Exclude<RunType, "race">[];

// ---------------------------------------------------------------------------
// Planned run on the calendar — this is the nutrition designation
// ---------------------------------------------------------------------------

export function DesignationForm({
  date,
  paceMinPerKm,
  initial,
  submitLabel = "Add to calendar",
  onDone,
}: {
  date: string;
  paceMinPerKm: number;
  initial?: {
    id?: string;
    run_type: Exclude<RunType, "race">;
    planned_distance_km: number | null;
    planned_duration_min: number | null;
    duration_estimated?: boolean;
  };
  submitLabel?: string;
  onDone?: () => void;
}) {
  const { pending, error, run } = useRunAction();
  const [runType, setRunType] = useState<Exclude<RunType, "race">>(
    initial?.run_type ?? "long",
  );
  const [distance, setDistance] = useState(fromKm(initial?.planned_distance_km));
  const [unit, setUnit] = useState<Unit>("mi");
  const [duration, setDuration] = useState(
    initial?.planned_duration_min != null && !initial.duration_estimated
      ? String(Math.round(initial.planned_duration_min))
      : "",
  );
  const [notice, setNotice] = useState<string | null>(null);

  const distanceKm = toKm(distance, unit);
  const durationMin = parseNum(duration);
  const effective =
    durationMin ?? (distanceKm != null ? estimateDurationMin(distanceKm, paceMinPerKm) : null);
  const qualifies = qualifiesForFueling(runType, effective);

  function submit() {
    run(
      () =>
        designateRunAction({
          id: initial?.id,
          date,
          run_type: runType,
          planned_distance_km: distanceKm,
          planned_duration_min: durationMin,
        }),
      (res) => {
        setNotice(
          res.qualifies
            ? null
            : "Saved. It's below the fueling threshold, so targets don't change.",
        );
        if (res.qualifies) onDone?.();
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Run type">
          <Select
            value={runType}
            onChange={(e) => setRunType(e.target.value as Exclude<RunType, "race">)}
          >
            {TRAINING_TYPES.map((t) => (
              <option key={t} value={t}>
                {runTypeLabel(t)}
              </option>
            ))}
          </Select>
        </Field>
        <DistanceField
          label="Intended distance"
          value={distance}
          unit={unit}
          onValue={setDistance}
          onUnit={setUnit}
        />
        <Field label="Intended duration (min)">
          <Input
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder={
              distanceKm != null
                ? `~${estimateDurationMin(distanceKm, paceMinPerKm)} from easy pace`
                : "e.g. 90"
            }
          />
        </Field>
      </div>
      <p className="text-text-muted text-xs">
        {effective == null
          ? "Enter a distance or a duration. Distance alone is timed at your recent easy pace."
          : qualifies
            ? `${formatRunDuration(effective)} ${durationMin == null ? "(estimated) " : ""}qualifies for run fuel.`
            : `${formatRunDuration(effective)} is under the fueling threshold (75 min, or 60 min for tempo/intervals). It will be stored but won't change targets.`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={pending || effective == null}
          onClick={submit}
        >
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
      {notice ? <p className="text-text-muted text-xs">{notice}</p> : null}
      <FormError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actual run (manual until Garmin)
// ---------------------------------------------------------------------------

export function ActualRunForm({
  date,
  plannedOptions,
  initial,
  onDone,
}: {
  date: string;
  plannedOptions: { id: string; label: string }[];
  initial?: {
    id: string;
    run_type: RunType | null;
    actual_distance_km: number | null;
    actual_duration_min: number;
    planned_run_id: string | null;
  };
  onDone?: () => void;
}) {
  const { pending, error, run } = useRunAction();
  const [duration, setDuration] = useState(
    initial ? String(Math.round(initial.actual_duration_min)) : "",
  );
  const [distance, setDistance] = useState(fromKm(initial?.actual_distance_km));
  const [unit, setUnit] = useState<Unit>("mi");
  const [runType, setRunType] = useState<RunType | "">(initial?.run_type ?? "");
  const [plannedId, setPlannedId] = useState<string>(
    initial?.planned_run_id ?? plannedOptions[0]?.id ?? "",
  );

  function submit() {
    const durationMin = parseNum(duration);
    if (durationMin == null) return;
    run(
      () =>
        saveActualRunAction({
          id: initial?.id,
          date,
          actual_duration_min: durationMin,
          actual_distance_km: toKm(distance, unit),
          run_type: runType || null,
          planned_run_id: plannedId || null,
        }),
      () => {
        if (!initial) {
          setDuration("");
          setDistance("");
        }
        onDone?.();
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Actual duration (min)">
          <Input
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="e.g. 95"
          />
        </Field>
        <DistanceField
          label="Actual distance"
          value={distance}
          unit={unit}
          onValue={setDistance}
          onUnit={setUnit}
        />
        <Field label="Run type">
          <Select value={runType} onChange={(e) => setRunType(e.target.value as RunType | "")}>
            <option value="">{plannedOptions.length ? "Same as plan" : "Easy (default)"}</option>
            {[...RUN_TYPES, "race" as const].map((t) => (
              <option key={t} value={t}>
                {runTypeLabel(t)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {plannedOptions.length > 0 ? (
        <Field label="Reconcile against">
          <Select value={plannedId} onChange={(e) => setPlannedId(e.target.value)}>
            {plannedOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            <option value="">No plan (unplanned run)</option>
          </Select>
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={pending || parseNum(duration) == null}
          onClick={submit}
        >
          {pending ? "Saving…" : initial ? "Update run" : "Log actual run"}
        </Button>
        {onDone && initial ? (
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
      <FormError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode 3 — race entry (calendar only)
// ---------------------------------------------------------------------------

export function RaceForm({
  date,
  initial,
  onDone,
}: {
  date: string;
  initial?: {
    id: string;
    event_type: RaceEventType;
    event_date: string;
    planned_duration_min: number | null;
    duration_estimated: boolean;
  };
  onDone?: () => void;
}) {
  const { pending, error, run } = useRunAction();
  const [eventType, setEventType] = useState<RaceEventType>(
    initial?.event_type ?? "ten_mile",
  );
  const [eventDate, setEventDate] = useState(initial?.event_date ?? date);
  const [goal, setGoal] = useState(
    initial?.planned_duration_min != null && !initial.duration_estimated
      ? String(Math.round(initial.planned_duration_min))
      : "",
  );
  const [result, setResult] = useState<string | null>(null);

  function submit() {
    run(
      () =>
        saveRaceAction({
          id: initial?.id,
          event_type: eventType,
          event_date: eventDate,
          planned_duration_min: parseNum(goal),
        }),
      (res) => {
        setResult(
          res.warning ??
            `Saved. Carb load on ${res.load_dates.length} day${res.load_dates.length === 1 ? "" : "s"} before the race.`,
        );
        if (!res.warning) onDone?.();
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Event">
          <Select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as RaceEventType)}
          >
            {(Object.keys(RACE_EVENTS) as RaceEventType[]).map((t) => (
              <option key={t} value={t}>
                {RACE_EVENTS[t].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Race date">
          <Input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        </Field>
        <Field label="Goal time (min, optional)">
          <Input
            inputMode="numeric"
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="from easy pace if blank"
          />
        </Field>
      </div>
      <p className="text-text-muted text-xs">
        {RACE_EVENTS[eventType].load_days}-day carb load at{" "}
        {RACE_EVENTS[eventType].carbs_g_per_kg.min}–{RACE_EVENTS[eventType].carbs_g_per_kg.max} g/kg
        (default {RACE_EVENTS[eventType].carbs_g_per_kg.default}), from your latest
        weigh-in. Designate 3+ days out for the full load.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="primary" disabled={pending || !eventDate} onClick={submit}>
          {pending ? "Saving…" : initial ? "Update race" : "Add race"}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            {result ? "Done" : "Cancel"}
          </Button>
        ) : null}
      </div>
      {result ? <p className="text-text-secondary text-xs">{result}</p> : null}
      <FormError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Training plan queue item (dateless: type + mileage)
// ---------------------------------------------------------------------------

export function PlanRunForm({
  initial,
  onDone,
}: {
  initial?: {
    id: string;
    run_type: Exclude<RunType, "race">;
    distance_km: number | null;
    duration_min: number | null;
    notes: string | null;
  };
  onDone?: () => void;
}) {
  const { pending, error, run } = useRunAction();
  const [runType, setRunType] = useState<Exclude<RunType, "race">>(initial?.run_type ?? "easy");
  const [distance, setDistance] = useState(fromKm(initial?.distance_km));
  const [unit, setUnit] = useState<Unit>("mi");
  const [duration, setDuration] = useState(
    initial?.duration_min != null ? String(Math.round(initial.duration_min)) : "",
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const valid = parseNum(distance) != null || parseNum(duration) != null;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Run type">
          <Select
            value={runType}
            onChange={(e) => setRunType(e.target.value as Exclude<RunType, "race">)}
          >
            {TRAINING_TYPES.map((t) => (
              <option key={t} value={t}>
                {runTypeLabel(t)}
              </option>
            ))}
          </Select>
        </Field>
        <DistanceField value={distance} unit={unit} onValue={setDistance} onUnit={setUnit} />
        <Field label="Duration (min)">
          <Input
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="optional"
          />
        </Field>
      </div>
      <Field label="Note">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="optional" />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={pending || !valid}
          onClick={() =>
            run(
              () =>
                saveTrainingPlanRunAction({
                  id: initial?.id,
                  run_type: runType,
                  distance_km: toKm(distance, unit),
                  duration_min: parseNum(duration),
                  notes,
                }),
              () => onDone?.(),
            )
          }
        >
          {pending ? "Saving…" : initial ? "Update" : "Add to plan"}
        </Button>
        {onDone ? (
          <Button type="button" variant="ghost" onClick={onDone} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
      <FormError error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mid-run intake
// ---------------------------------------------------------------------------

export function MidRunIntakeForm({
  date,
  runRef,
}: {
  date: string;
  runRef: { planned_run_id?: string | null; actual_run_id?: string | null };
}) {
  const { pending, error, run } = useRunAction();
  const [custom, setCustom] = useState(false);
  const [label, setLabel] = useState("Chews");
  const [carbs, setCarbs] = useState("");
  const [kcal, setKcal] = useState("");
  const [minute, setMinute] = useState("");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="solid"
          disabled={pending}
          onClick={() =>
            run(() =>
              addMidRunIntakeAction({
                date,
                ...runRef,
                label: GEL_DEFAULT.label,
                carbs_g: GEL_DEFAULT.carbs_g,
                kcal: GEL_DEFAULT.kcal,
                taken_at_min: parseNum(minute),
              }),
            )
          }
        >
          + Gel ({GEL_DEFAULT.carbs_g} g · {GEL_DEFAULT.kcal} kcal)
        </Button>
        <Button type="button" variant="ghost" onClick={() => setCustom((v) => !v)}>
          {custom ? "Hide custom" : "Other fuel"}
        </Button>
      </div>
      <Field label="Minutes into run (optional)" className="max-w-[12rem]">
        <Input inputMode="numeric" value={minute} onChange={(e) => setMinute(e.target.value)} />
      </Field>
      {custom ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Item">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} />
          </Field>
          <Field label="Carbs (g)">
            <Input inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
          </Field>
          <Field label="Calories">
            <Input inputMode="decimal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              variant="solid"
              className="w-full"
              disabled={pending || parseNum(carbs) == null}
              onClick={() =>
                run(
                  () =>
                    addMidRunIntakeAction({
                      date,
                      ...runRef,
                      label,
                      carbs_g: parseNum(carbs) ?? 0,
                      kcal: parseNum(kcal) ?? Math.round((parseNum(carbs) ?? 0) * 4),
                      taken_at_min: parseNum(minute),
                    }),
                  () => {
                    setCarbs("");
                    setKcal("");
                  },
                )
              }
            >
              Log
            </Button>
          </div>
        </div>
      ) : null}
      <FormError error={error} />
    </div>
  );
}
