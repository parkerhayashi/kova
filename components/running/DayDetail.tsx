"use client";

import { useState } from "react";
import { Check, Flag, Trash2 } from "lucide-react";
import {
  deleteActualRunAction,
  deleteCalendarRunAction,
  deleteMidRunIntakeAction,
  deletePlannedRunAction,
  setPlannedRunStatusAction,
} from "@/app/(dashboard)/running/actions";
import { RaceDayGuidance, RunFuelCard } from "@/components/nutrition/RunFuelCard";
import {
  ActualRunForm,
  DesignationForm,
  FormError,
  MidRunIntakeForm,
  RaceForm,
  TrainingRunForm,
  useRunAction,
} from "@/components/running/RunForms";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { DailyTotals } from "@/lib/nutrition";
import type { ComputedNutritionGoals } from "@/lib/nutrition-goals";
import {
  formatDistance,
  formatRunDuration,
  qualifiesForFueling,
  raceEventLabel,
  runTypeLabel,
} from "@/lib/run-fuel";
import { daysBetween, formatIsoDateLabel } from "@/lib/utils";
import type {
  ActualRun,
  CalendarEntry,
  CalendarRun,
  MidRunIntake,
  PlannedRun,
  RunFuelAdjustment,
  RunType,
} from "@/types";

function runSummary(r: {
  planned_distance_km: number | null;
  planned_duration_min: number | null;
}): string {
  const parts = [];
  if (r.planned_distance_km != null) parts.push(formatDistance(r.planned_distance_km));
  if (r.planned_duration_min != null) parts.push(formatRunDuration(r.planned_duration_min));
  return parts.join(" · ") || "—";
}

function IconButton({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className="text-text-muted hover:text-text-primary flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-40"
    >
      <Trash2 className="size-4" />
    </button>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-border flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5">
      {children}
    </div>
  );
}

export function DayDetail({
  date,
  today,
  entries,
  planned,
  actual,
  intakes,
  calendarRuns,
  adjustment,
  goals,
  totals,
  paceMinPerKm,
}: {
  date: string;
  today: string;
  entries: CalendarEntry[];
  planned: PlannedRun[];
  actual: ActualRun[];
  intakes: MidRunIntake[];
  calendarRuns: CalendarRun[];
  adjustment: RunFuelAdjustment | null;
  goals: ComputedNutritionGoals;
  totals: DailyTotals;
  paceMinPerKm: number;
}) {
  const { pending, error, run } = useRunAction();
  const [designating, setDesignating] = useState<
    | { calendarRunId: string | null; run_type: Exclude<RunType, "race">; planned_distance_km: number | null; planned_duration_min: number | null }
    | null
  >(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);
  const [addingTraining, setAddingTraining] = useState(false);
  const [editingTraining, setEditingTraining] = useState<string | null>(null);
  const [addingRace, setAddingRace] = useState(false);
  const [editingRace, setEditingRace] = useState(false);
  const [editingActual, setEditingActual] = useState<string | null>(null);

  const isPast = date < today;
  const isFuture = date > today;
  const prescribed = entries.filter((e) => e.kind === "prescribed_run");
  const race = planned.find((p) => p.is_race) ?? null;
  const designations = planned.filter((p) => !p.is_race);
  const linkedActual = new Set(actual.map((a) => a.planned_run_id));
  const openPlans = planned.filter((p) => !linkedActual.has(p.id));

  const targets = {
    calories: goals.calories,
    protein_g: goals.protein_g,
    carbs_g: goals.carbs_g,
    fat_g: goals.fat_g,
  };
  const runDay = goals.meta.run_day;

  // Mid-run fuel attaches to the actual run once it exists, else the plan.
  const fuelRunRef = actual[0]
    ? { actual_run_id: actual[0].id, planned_run_id: actual[0].planned_run_id }
    : planned.find((p) => p.status !== "skipped")
      ? { planned_run_id: planned.find((p) => p.status !== "skipped")!.id }
      : null;

  const startDesignation = (from?: {
    calendarRunId?: string | null;
    run_type: RunType | null;
    planned_distance_km: number | null;
    planned_duration_min: number | null;
  }) =>
    setDesignating({
      calendarRunId: from?.calendarRunId ?? null,
      run_type:
        from?.run_type && from.run_type !== "race" ? from.run_type : "long",
      planned_distance_km: from?.planned_distance_km ?? null,
      planned_duration_min: from?.planned_duration_min ?? null,
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          {date === today ? "Today" : formatIsoDateLabel(date, { weekday: "long", month: "short", day: "numeric" })}
        </h2>
        <span className="metric-label">
          {adjustment?.kind === "carb_load"
            ? "Carb-load day"
            : adjustment
              ? `Run fuel · ${adjustment.basis === "actual" ? "actual" : "estimated"}`
              : "Base targets"}
        </span>
      </div>

      {/* Nutrition for the day */}
      {runDay?.fuel || runDay?.adjustment_removed ? (
        <RunFuelCard
          date={date}
          runDay={runDay}
          targets={targets}
          totals={totals}
          intakes={intakes}
        />
      ) : (
        <Card className="space-y-1">
          <span className="metric-label">Nutrition</span>
          <p className="text-text-muted text-sm tabular-nums">
            Base targets: {goals.calories.toLocaleString("en-US")} kcal · P {goals.protein_g} g ·
            C {goals.carbs_g} g · F {goals.fat_g} g. Runs only change nutrition once you designate
            them below.
          </p>
        </Card>
      )}

      {/* Training plan + calendar entries (training only) */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="metric-label">Training plan</span>
          {!addingTraining ? (
            <Button type="button" variant="ghost" onClick={() => setAddingTraining(true)}>
              Add training run
            </Button>
          ) : null}
        </div>
        {prescribed.length === 0 && calendarRuns.length === 0 && !addingTraining ? (
          <p className="text-text-muted text-sm">Nothing on the plan for this day.</p>
        ) : null}
        {prescribed.map((entry) => (
          <Row key={entry.id}>
            <div>
              <p className="text-sm font-semibold">
                {entry.run_type ? runTypeLabel(entry.run_type) : "Run"} · {runSummary(entry)}
              </p>
              <p className="text-text-muted text-xs">Prescribed · {entry.label}</p>
            </div>
            {!isPast && designations.length === 0 ? (
              <Button type="button" variant="ghost" onClick={() => startDesignation(entry)}>
                Plan fuel
              </Button>
            ) : null}
          </Row>
        ))}
        {calendarRuns.map((entry) =>
          editingTraining === entry.id ? (
            <TrainingRunForm
              key={entry.id}
              date={date}
              initial={entry}
              onDone={() => setEditingTraining(null)}
            />
          ) : (
            <Row key={entry.id}>
              <div>
                <p className="text-sm font-semibold">
                  {runTypeLabel(entry.run_type)} · {runSummary(entry)}
                </p>
                <p className="text-text-muted text-xs">
                  {entry.notes ? `${entry.notes} · ` : ""}
                  {entry.planned_run_id ? "Fuel planned" : "Training only"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {!isPast && !entry.planned_run_id ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => startDesignation({ ...entry, calendarRunId: entry.id })}
                  >
                    Plan fuel
                  </Button>
                ) : null}
                <Button type="button" variant="ghost" onClick={() => setEditingTraining(entry.id)}>
                  Edit
                </Button>
                <IconButton
                  label="Delete calendar entry"
                  disabled={pending}
                  onClick={() => run(() => deleteCalendarRunAction(entry.id))}
                />
              </div>
            </Row>
          ),
        )}
        {addingTraining ? (
          <TrainingRunForm date={date} onDone={() => setAddingTraining(false)} />
        ) : null}
      </Card>

      {/* Mode 2 — nutrition designation */}
      {!race ? (
        <Card className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="metric-label">Fueling run</span>
            {!designating && designations.length === 0 && !isPast ? (
              <Button type="button" variant="ghost" onClick={() => startDesignation()}>
                Plan a fueling run
              </Button>
            ) : null}
          </div>
          {designations.length === 0 && !designating ? (
            <p className="text-text-muted text-sm">
              {isPast
                ? "No run was designated for nutrition."
                : "Designate the run you intend to do. Runs over 75 min (or tempo/intervals over 60) get extra carbs."}
            </p>
          ) : null}
          {designations.map((plan) =>
            editingPlan === plan.id ? (
              <DesignationForm
                key={plan.id}
                date={date}
                paceMinPerKm={paceMinPerKm}
                initial={plan as PlannedRun & { run_type: Exclude<RunType, "race"> }}
                submitLabel="Update planned run"
                onDone={() => setEditingPlan(null)}
              />
            ) : (
              <Row key={plan.id}>
                <div>
                  <p className="text-sm font-semibold">
                    {runTypeLabel(plan.run_type)} · {runSummary(plan)}
                    {plan.duration_estimated ? " (est.)" : ""}
                  </p>
                  <p className="text-text-muted text-xs capitalize">
                    {plan.status}
                    {" · "}
                    {qualifiesForFueling(plan.run_type, plan.planned_duration_min)
                      ? "fueling run"
                      : "below threshold, no change"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {plan.status !== "completed" ? (
                    <>
                      <Button type="button" variant="ghost" onClick={() => setEditingPlan(plan.id)}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            setPlannedRunStatusAction(
                              plan.id,
                              plan.status === "skipped" ? "planned" : "skipped",
                            ),
                          )
                        }
                      >
                        {plan.status === "skipped" ? "Unskip" : "Skip"}
                      </Button>
                    </>
                  ) : null}
                  <IconButton
                    label="Remove designation"
                    disabled={pending}
                    onClick={() => run(() => deletePlannedRunAction(plan.id))}
                  />
                </div>
              </Row>
            ),
          )}
          {designating ? (
            <DesignationForm
              date={date}
              paceMinPerKm={paceMinPerKm}
              calendarRunId={designating.calendarRunId}
              initial={{
                run_type: designating.run_type,
                planned_distance_km: designating.planned_distance_km,
                planned_duration_min: designating.planned_duration_min,
              }}
              onDone={() => setDesignating(null)}
            />
          ) : null}
        </Card>
      ) : null}

      {/* Mode 3 — race */}
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="metric-label flex items-center gap-1.5">
            <Flag className="size-3.5" /> Race
          </span>
          {!race && !addingRace && !isPast ? (
            <Button type="button" variant="ghost" onClick={() => setAddingRace(true)}>
              Add race
            </Button>
          ) : null}
        </div>
        {race && !editingRace ? (
          <>
            <Row>
              <div>
                <p className="text-sm font-semibold">
                  {race.event_type ? raceEventLabel(race.event_type) : "Race"} ·{" "}
                  {runSummary(race)}
                  {race.duration_estimated ? " (est.)" : ""}
                </p>
                <p className="text-text-muted text-xs capitalize">
                  {race.status}
                  {race.designated_at
                    ? ` · designated ${Math.max(0, daysBetween(race.date, race.designated_at.slice(0, 10)))} days out`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {race.status !== "completed" ? (
                  <Button type="button" variant="ghost" onClick={() => setEditingRace(true)}>
                    Edit
                  </Button>
                ) : null}
                <IconButton
                  label="Delete race"
                  disabled={pending}
                  onClick={() => run(() => deletePlannedRunAction(race.id))}
                />
              </div>
            </Row>
            {!isPast ? <RaceDayGuidance /> : null}
          </>
        ) : null}
        {race && editingRace && race.event_type ? (
          <RaceForm
            date={date}
            initial={{
              id: race.id,
              event_type: race.event_type,
              event_date: race.event_date ?? race.date,
              planned_duration_min: race.planned_duration_min,
              duration_estimated: race.duration_estimated,
            }}
            onDone={() => setEditingRace(false)}
          />
        ) : null}
        {!race && addingRace ? <RaceForm date={date} onDone={() => setAddingRace(false)} /> : null}
        {!race && !addingRace ? (
          <p className="text-text-muted text-sm">
            Races are entered here. Entering one sets up its carb load and race-day fueling.
          </p>
        ) : null}
      </Card>

      {/* Actual run */}
      {!isFuture ? (
        <Card className="space-y-3">
          <span className="metric-label flex items-center gap-1.5">
            <Check className="size-3.5" /> Actual run
          </span>
          {actual.map((a) =>
            editingActual === a.id ? (
              <ActualRunForm
                key={a.id}
                date={date}
                initial={a}
                plannedOptions={planned
                  .filter((p) => p.id === a.planned_run_id || !linkedActual.has(p.id))
                  .map((p) => ({
                    id: p.id,
                    label: `${p.is_race && p.event_type ? raceEventLabel(p.event_type) : runTypeLabel(p.run_type)} · ${runSummary(p)}`,
                  }))}
                onDone={() => setEditingActual(null)}
              />
            ) : (
              <Row key={a.id}>
                <div>
                  <p className="text-sm font-semibold">
                    {formatRunDuration(a.actual_duration_min)}
                    {a.actual_distance_km != null ? ` · ${formatDistance(a.actual_distance_km)}` : ""}
                    {a.run_type ? ` · ${runTypeLabel(a.run_type)}` : ""}
                  </p>
                  <p className="text-text-muted text-xs">
                    {a.source === "garmin" ? "Garmin" : "Manual"} ·{" "}
                    {a.planned_run_id ? "reconciled to plan" : "unplanned"}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {a.source === "manual" ? (
                    <Button type="button" variant="ghost" onClick={() => setEditingActual(a.id)}>
                      Edit
                    </Button>
                  ) : null}
                  <IconButton
                    label="Delete run"
                    disabled={pending}
                    onClick={() => run(() => deleteActualRunAction(a.id))}
                  />
                </div>
              </Row>
            ),
          )}
          {actual.length === 0 || editingActual == null ? (
            <ActualRunForm
              key={`new-${actual.length}`}
              date={date}
              plannedOptions={openPlans.map((p) => ({
                id: p.id,
                label: `${p.is_race && p.event_type ? raceEventLabel(p.event_type) : runTypeLabel(p.run_type)} · ${runSummary(p)}`,
              }))}
            />
          ) : null}
          <p className="text-text-muted text-xs">
            Manual entry until Garmin sync is connected. It writes the same record the sync will.
          </p>
        </Card>
      ) : null}

      {/* Mid-run fuel */}
      {fuelRunRef && !isFuture ? (
        <Card className="space-y-3">
          <span className="metric-label">On-run fuel</span>
          {intakes.map((i) => (
            <Row key={i.id}>
              <p className="text-sm tabular-nums">
                {i.label} · {Math.round(i.carbs_g)} g carbs · {Math.round(i.kcal)} kcal
                {i.taken_at_min != null ? ` · min ${Math.round(i.taken_at_min)}` : ""}
              </p>
              <IconButton
                label="Delete fuel item"
                disabled={pending}
                onClick={() => run(() => deleteMidRunIntakeAction(i.id))}
              />
            </Row>
          ))}
          <MidRunIntakeForm date={date} runRef={fuelRunRef} />
          <p className="text-text-muted text-xs">
            Counts toward the day&apos;s carbs and calories. It doesn&apos;t change targets.
          </p>
        </Card>
      ) : null}

      <FormError error={error} />
    </div>
  );
}
