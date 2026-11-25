"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Bike, Check, Dumbbell, Footprints, Sparkles, X } from "lucide-react";
import {
  createPlanAction,
  moveWorkoutAction,
  resolveSuggestionAction,
  setWorkoutSkippedAction,
} from "@/app/(dashboard)/training/actions";
import { WorkoutSteps } from "@/components/training/WorkoutSteps";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Input";
import type { ActivePlan, PlanWorkoutView } from "@/lib/data/plan";
import { WEEKDAYS } from "@/lib/plan-engine";
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

function DayChips({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map((d, i) => (
        <button
          key={d}
          type="button"
          aria-pressed={value.includes(i)}
          onClick={() => onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            value.includes(i) ? "border-border-strong bg-[rgba(255,255,255,0.1)] text-text-primary" : "border-border text-text-secondary",
          )}
        >
          {d}
        </button>
      ))}
    </div>
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
  const [runDays, setRunDays] = useState(initial?.run_days ?? [1, 3, 5]);
  const [longDay, setLongDay] = useState(initial?.long_run_day ?? 5);
  const [liftDays, setLiftDays] = useState(initial?.lift_days ?? [0, 2, 4]);
  const [rideDays, setRideDays] = useState(initial?.ride_days ?? [6]);
  const [legs, setLegs] = useState(initial?.legs_per_week ?? 1);
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
      <div className="space-y-1.5">
        <span className="metric-label">Run days</span>
        <DayChips value={runDays} onChange={setRunDays} />
      </div>
      <Field label="Long run day" className="max-w-[12rem]">
        <Select value={String(longDay)} onChange={(e) => setLongDay(Number(e.target.value))}>
          {runDays.map((d) => (
            <option key={d} value={d}>
              {WEEKDAYS[d]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="space-y-1.5">
        <span className="metric-label">Lift days · Push / Pull / Legs</span>
        <DayChips value={liftDays} onChange={setLiftDays} />
      </div>
      <Field label="Leg days per week" className="max-w-[12rem]">
        <Select value={String(legs)} onChange={(e) => setLegs(Number(e.target.value))}>
          <option value="1">1 (recommended while running builds)</option>
          <option value="2">2</option>
        </Select>
      </Field>
      <div className="space-y-1.5">
        <span className="metric-label">Ride days</span>
        <DayChips value={rideDays} onChange={setRideDays} />
      </div>
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
          disabled={pending || runDays.length === 0 || !runDays.includes(longDay)}
          onClick={() =>
            run(() =>
              createPlanAction({
                settings: {
                  run_days: runDays,
                  long_run_day: longDay,
                  lift_days: liftDays,
                  ride_days: rideDays,
                  goal_time_min: goalMin,
                  legs_per_week: legs,
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

/** Move / skip controls for one workout (also used in the day view). */
export function WorkoutActions({ w }: { w: PlanWorkoutView }) {
  const { pending, error, run } = useAction();
  const [date, setDate] = useState(w.date);
  if (w.state === "done") return null;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-end gap-2">
        {w.state !== "skipped" ? (
          <>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[11rem]" aria-label="Move to date" />
            <Button type="button" variant="ghost" disabled={pending || date === w.date} onClick={() => run(() => moveWorkoutAction(w.id, date))}>
              Move
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => setWorkoutSkippedAction(w.id, true))}>
              Skip
            </Button>
          </>
        ) : (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => setWorkoutSkippedAction(w.id, false))}>
            Restore
          </Button>
        )}
      </div>
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

/** Plan overview: phase, AI review, suggestions, this week, next workout. */
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
  const week = data.workouts.filter((w) => w.date >= monday && w.date <= sunday);
  const next = data.workouts.find((w) => w.sport === "run" && (w.state === "today" || w.state === "upcoming"));
  const runsThisWeek = week.filter((w) => w.sport === "run" && w.state !== "skipped");
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
          <span className="metric-label">This week</span>
          <ul className="space-y-1">
            {week.map((w) => (
              <li key={w.id} className={cn("flex items-center gap-2 text-sm", w.state === "skipped" && "text-text-muted line-through")}>
                <span className="text-text-muted w-8 shrink-0 text-xs">{WEEKDAYS[(new Date(`${w.date}T12:00:00Z`).getUTCDay() + 6) % 7]}</span>
                <SportIcon sport={w.sport} className="text-text-secondary" />
                <span className="min-w-0 flex-1 truncate">{w.title}</span>
                <StateMark w={w} />
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {next ? (
        <Card className="space-y-2">
          <span className="metric-label">{next.state === "today" ? "Today's run" : "Next run"}</span>
          <PlannedWorkout w={next} />
        </Card>
      ) : null}
    </div>
  );
}
