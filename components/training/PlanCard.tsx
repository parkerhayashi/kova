"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bike, Check, Dumbbell, Footprints, Sparkles, X } from "lucide-react";
import {
  createPlanAction,
  resolveSuggestionAction,
  setWorkoutSkippedAction,
} from "@/app/(dashboard)/training/actions";
import { WorkoutSteps } from "@/components/training/WorkoutSteps";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Input";
import type { ActivePlan, PlanWorkoutView } from "@/lib/data/plan";
import { planCounts, WEEKDAYS } from "@/lib/plan-engine";
import { cn, formatIsoDateLabel } from "@/lib/utils";
import type { PlanSettings, PlanSport } from "@/types";

const PHASE_LABEL: Record<string, string> = {
  run_walk: "Run/walk build",
  base: "Base",
  build: "Build",
  peak: "Peak",
  taper: "Taper",
  race: "Race week",
};

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

export function SportIcon({ sport, className }: { sport: PlanSport; className?: string }) {
  const Icon = sport === "run" ? Footprints : sport === "ride" ? Bike : Dumbbell;
  return <Icon className={cn("size-3.5 shrink-0", className)} />;
}

/** Workout state is data: done green, missed red. */
function StateMark({ w }: { w: PlanWorkoutView }) {
  if (w.state === "done") return <Check className="size-3.5 shrink-0" style={{ color: "var(--color-recovery)" }} aria-label="Done" />;
  if (w.state === "missed") return <X className="size-3.5 shrink-0" style={{ color: "var(--color-stress)" }} aria-label="Missed" />;
  if (w.state === "skipped") return <span className="text-text-muted text-[10px] uppercase">skip</span>;
  return <span className="size-1.5 shrink-0 rounded-full bg-white/70" aria-hidden />;
}

function CountSelect({ label, value, onChange, min, max, hint }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; hint?: string }) {
  return (
    <Field label={label} className="max-w-[12rem]">
      <Select value={String(value)} onChange={(e) => onChange(Number(e.target.value))}>
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <option key={n} value={n}>
            {n}
            {hint && n === value ? ` ${hint}` : ""}
          </option>
        ))}
      </Select>
    </Field>
  );
}

/** Build (or rebuild) the plan toward the goal race. */
export function PlanSetup({
  raceName,
  raceDate,
  queueCount,
  initial,
  onCancel,
}: {
  raceName: string | null;
  raceDate: string | null;
  queueCount: number;
  initial?: PlanSettings;
  onCancel?: () => void;
}) {
  const { pending, error, run } = useAction();
  const c = initial ? planCounts(initial) : null;
  const [runs, setRuns] = useState(c?.runs ?? 3);
  const [lifts, setLifts] = useState(c?.lifts ?? 5);
  const [rides, setRides] = useState(c?.rides ?? 0);
  const [legs, setLegs] = useState(c?.legs ?? 1);
  const [weekendLong, setWeekendLong] = useState(c ? c.weekendLongMin != null : true);
  const [goal, setGoal] = useState(
    initial?.goal_time_min ? `${Math.floor(initial.goal_time_min / 60)}:${String(Math.round(initial.goal_time_min % 60)).padStart(2, "0")}` : "",
  );
  const [includeRw, setIncludeRw] = useState(queueCount > 0);
  const goalMin = (() => {
    const m = goal.trim().match(/^(\d+):(\d{1,2})$/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  })();

  if (!raceName || !raceDate) {
    return (
      <Card className="space-y-2">
        <span className="metric-label">Training plan</span>
        <p className="body-copy text-sm">Add your goal race on the calendar below (pick its day → Add race), then build a plan toward it.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4">
      <div>
        <span className="metric-label">Build your plan</span>
        <p className="text-text-secondary mt-1 text-sm">
          Toward <span className="text-text-primary font-semibold">{raceName}</span> on {formatIsoDateLabel(raceDate)}.
        </p>
      </div>
      <p className="text-text-secondary text-sm">
        Set weekly targets — no fixed days. Kova pencils sessions into the days left, re-plans the rest of the week whenever
        you log something, and pairs a run with a lift on busy weeks.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountSelect label="Runs / week" value={runs} onChange={setRuns} min={1} max={7} />
        <CountSelect label="Lifts / week" value={lifts} onChange={setLifts} min={0} max={7} />
        <CountSelect label="Rides / week" value={rides} onChange={setRides} min={0} max={7} />
        <CountSelect label="Leg days / week" value={legs} onChange={setLegs} min={1} max={2} />
      </div>
      <p className="text-text-muted text-xs">
        Lifts rotate Push / Pull / Legs. One leg day is plenty while running volume builds — runs already load your legs.
      </p>
      <label className="text-text-secondary flex items-start gap-2 text-sm">
        <input type="checkbox" className="accent-white mt-1" checked={weekendLong} onChange={(e) => setWeekendLong(e.target.checked)} />
        <span>Long runs of an hour or more go on the weekend when possible (any day before that).</span>
      </label>
      <Field label="Goal time (optional, h:mm)" className="max-w-[12rem]">
        <Input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. 2:45" />
      </Field>
      {queueCount > 0 ? (
        <label className="text-text-secondary flex items-start gap-2 text-sm">
          <input type="checkbox" className="accent-white mt-1" checked={includeRw} onChange={(e) => setIncludeRw(e.target.checked)} />
          <span>
            Start with my run/walk progression ({queueCount} sessions left, in order). Levels only move up when the last
            one went pain-free.
          </span>
        </label>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="primary"
          disabled={pending}
          onClick={() =>
            run(() =>
              createPlanAction({
                settings: {
                  runs_per_week: runs,
                  lifts_per_week: lifts,
                  rides_per_week: rides,
                  legs_per_week: legs,
                  long_run_weekend_min: weekendLong ? 60 : null,
                  goal_time_min: goalMin,
                },
                include_run_walk: includeRw,
              }),
              onCancel,
            )
          }
        >
          {pending ? "Building…" : initial ? "Rebuild plan" : "Build plan"}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </div>
      {initial ? <p className="text-text-muted text-xs">Rebuilding replaces upcoming workouts; what you&apos;ve done stays matched.</p> : null}
      {error ? <p className="text-text-secondary text-sm">{error}</p> : null}
    </Card>
  );
}

/** Skip / restore one workout (also used in the day view). Days re-flow on their own, so there's no "move". */
export function WorkoutActions({ w }: { w: PlanWorkoutView }) {
  const { pending, error, run } = useAction();
  if (w.state === "done" || w.kind === "race") return null;
  return (
    <div className="space-y-1.5">
      {w.state !== "skipped" ? (
        <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => setWorkoutSkippedAction(w.id, true))}>
          Skip this one
        </Button>
      ) : (
        <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => setWorkoutSkippedAction(w.id, false))}>
          Restore
        </Button>
      )}
      {error ? <p className="text-text-secondary text-xs">{error}</p> : null}
    </div>
  );
}

/** One planned workout with its steps. */
export function PlannedWorkout({ w, showActions = true }: { w: PlanWorkoutView; showActions?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <SportIcon sport={w.sport} />
            {w.title}
          </p>
          <p className="text-text-muted text-xs">
            {w.state === "upcoming" && w.kind !== "race" ? "Pencilled in " : ""}
            {formatIsoDateLabel(w.date)} · {PHASE_LABEL[w.phase] ?? w.phase}
            {w.state === "done" && w.actual ? ` · done: ${w.actual.title}` : w.state === "missed" ? " · missed" : w.state === "skipped" ? " · skipped" : ""}
          </p>
        </div>
        <StateMark w={w} />
      </div>
      {w.state !== "skipped" ? <WorkoutSteps steps={w.steps} /> : null}
      {w.notes ? <p className="text-text-muted text-xs">{w.notes}</p> : null}
      {showActions ? <WorkoutActions w={w} /> : null}
    </div>
  );
}

const dayIndex = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

/** Plan overview: phase, AI review, suggestions, adjustments, the week's checklist, and today's pick. */
export function PlanCard({
  data,
  today,
  queueCount,
}: {
  data: ActivePlan;
  today: string;
  queueCount: number;
}) {
  const { pending, error, run } = useAction();
  const [rebuilding, setRebuilding] = useState(false);
  const monday = (() => {
    const d = new Date(`${today}T12:00:00Z`);
    const wd = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - wd);
    return d.toISOString().slice(0, 10);
  })();
  const sunday = new Date(Date.parse(`${monday}T12:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
  const week = data.workouts.filter((w) => w.date >= monday && w.date <= sunday && w.state !== "skipped");
  const done = week.filter((w) => w.state === "done").sort((a, b) => a.date.localeCompare(b.date) || a.sport.localeCompare(b.sport));
  const left = week.filter((w) => w.state === "today" || w.state === "upcoming").sort((a, b) => a.date.localeCompare(b.date));
  const todays = left.filter((w) => w.date === today);
  const doneToday = done.filter((w) => w.date === today);
  const nextUp = left.find((w) => w.date > today) ?? data.workouts.find((w) => w.date > sunday && w.state === "upcoming");
  const runsThisWeek = week.filter((w) => w.sport === "run" && w.kind !== "race");
  const doneRuns = runsThisWeek.filter((w) => w.state === "done").length;

  if (rebuilding) {
    return (
      <PlanSetup
        raceName={data.race ? data.race.name ?? "your race" : null}
        raceDate={data.race?.date ?? null}
        queueCount={queueCount}
        initial={data.plan.settings}
        onCancel={() => setRebuilding(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <span className="metric-label">Training plan</span>
            <p className="text-text-primary mt-1 text-lg font-semibold">
              {PHASE_LABEL[data.current.phase] ?? data.current.phase} · week {data.current.week} of {data.current.weeks}
            </p>
            {data.race ? (
              <p className="text-text-muted text-xs">
                {data.race.days_until} days to race · {doneRuns}/{runsThisWeek.length} runs done this week
              </p>
            ) : null}
          </div>
          <Button type="button" variant="ghost" className="py-1.5" onClick={() => setRebuilding(true)}>
            Rebuild
          </Button>
        </div>

        {data.review ? (
          <div className="border-border space-y-1 rounded-lg border p-3">
            <span className="metric-label flex items-center gap-1.5">
              <Sparkles className="size-3" /> Weekly review · {formatIsoDateLabel(data.review.week_start, { month: "short", day: "numeric" })}
            </span>
            <p className="text-text-secondary text-sm">{data.review.summary}</p>
          </div>
        ) : null}

        {data.suggestions.length > 0 ? (
          <div className="space-y-2">
            <span className="metric-label">Suggested changes</span>
            {data.suggestions.map((s) => (
              <div key={s.id} className="border-border space-y-2 rounded-lg border p-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  {s.source === "ai" ? <Sparkles className="size-3.5" /> : null}
                  {s.title}
                </p>
                <p className="text-text-secondary text-xs">{s.reason}</p>
                <div className="flex gap-2">
                  <Button type="button" variant="solid" disabled={pending} onClick={() => run(() => resolveSuggestionAction(s.id, true))}>
                    Accept
                  </Button>
                  <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => resolveSuggestionAction(s.id, false))}>
                    Dismiss
                  </Button>
                </div>
              </div>
            ))}
            {error ? <p className="text-text-secondary text-xs">{error}</p> : null}
          </div>
        ) : null}

        {data.adjustments.length > 0 ? (
          <div className="space-y-1.5">
            <span className="metric-label">Adjusted to what you did</span>
            <ul className="space-y-2">
              {data.adjustments.slice(0, 4).map((a) => (
                <li key={a.id} className="text-sm">
                  <p className="text-text-primary">{a.title}</p>
                  <p className="text-text-muted text-xs">{a.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <span className="metric-label">
            This week · {done.length} of {done.length + left.length} done
          </span>
          <ul className="space-y-1">
            {[...done, ...left].map((w) => (
              <li key={w.id} className={cn("flex items-center gap-2 text-sm", w.state !== "done" && "text-text-secondary")}>
                <StateMark w={w} />
                <SportIcon sport={w.sport} className="text-text-muted" />
                <span className="min-w-0 flex-1 truncate">{w.title}</span>
                <span className="text-text-muted shrink-0 text-xs">
                  {w.state === "done" ? WEEKDAYS[dayIndex(w.date)] : w.date === today ? "today" : `${WEEKDAYS[dayIndex(w.date)]}?`}
                </span>
              </li>
            ))}
          </ul>
          {left.length > 0 ? (
            <p className="text-text-muted text-xs">
              Days with a ? are pencilled in — do things in any order; whatever you log checks them off and the rest re-plans.
            </p>
          ) : null}
        </div>
      </Card>

      <Card className="space-y-3">
        <span className="metric-label">Today</span>
        {todays.length > 0 ? (
          todays.map((w) => <PlannedWorkout key={w.id} w={w} />)
        ) : (
          <div className="space-y-1">
            <p className="text-sm">
              {left.length === 0
                ? "This week's targets are done — anything extra is a bonus."
                : doneToday.length > 0
                  ? "Nothing else pencilled in today."
                  : "Nothing pencilled in today — a rest day, or get ahead on the next one."}
            </p>
            {doneToday.length > 0 ? (
              <p className="text-text-muted text-xs">Done today: {doneToday.map((w) => w.title).join(", ")}</p>
            ) : null}
          </div>
        )}
        {nextUp && todays.length === 0 ? (
          <div className="border-border border-t pt-3">
            <span className="metric-label">Next up</span>
            <div className="mt-2">
              <PlannedWorkout w={nextUp} />
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
