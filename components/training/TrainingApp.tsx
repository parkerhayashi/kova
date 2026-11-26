"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight, Flag, Wheat, Zap } from "lucide-react";
import { setRunFuelRateAction } from "@/app/(dashboard)/running/actions";
import { DayDetail } from "@/components/running/DayDetail";
import { FormError, useRunAction } from "@/components/running/RunForms";
import { NextRunCard } from "@/components/running/TrainingPlan";
import type { PlanWorkoutView } from "@/lib/data/plan";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import type { RunningRange, TrainingPlanView } from "@/lib/data/running";
import type { DailyTotals } from "@/lib/nutrition";
import type { ComputedNutritionGoals } from "@/lib/nutrition-goals";
import {
  formatPace,
  MAX_CARBS_PER_HOUR,
  MIN_CARBS_PER_HOUR,
} from "@/lib/run-fuel";
import { entryDone, entrySport, monthGridRange, weekStart } from "@/lib/run-calendar";
import { byDoneThenSport, dimmed, entryText, markStyle, SPORT_COLOR, SPORTS } from "@/components/training/sessions";
import { addDays, cn, formatIsoDateLabel } from "@/lib/utils";
import type {
  CalendarEntry,
  CalendarNutritionStatus,
  FuelProduct,
  GarminActivity,
  PlanSport,
  RunLap,
  RunStreamPoints,
  Workout,
} from "@/types";

/** A Hevy workout with the Garmin strength session recorded alongside it. */
export type TrainingLift = {
  workout: Pick<Workout, "id" | "date" | "title" | "duration" | "volume_kg">;
  garmin: GarminActivity | null;
};

type View = "week" | "month";
const VIEW_KEY = "kova.trainingView";
const PHONE = "(max-width: 639px)";

function subscribeWidth(onChange: () => void) {
  const mq = window.matchMedia(PHONE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function preferredView(): View {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === "week" || stored === "month") return stored;
  } catch {
    // storage blocked — fall back to screen width
  }
  return window.matchMedia(PHONE).matches ? "week" : "month";
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function shiftMonth(iso: string, delta: number): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Training calendar: runs and races (with run fuel), lifts and rides. */
export function TrainingApp({
  today,
  selected,
  view: initialView,
  range,
  goals,
  totals,
  pace,
  carbsPerHour,
  plan,
  fuelProducts,
  runExtras,
  lifts,
  rides,
  rideStreams,
  planWorkouts = [],
  showQueue = true,
  nextUp = null,
}: {
  today: string;
  selected: string;
  /** From ?view=; null lets the app pick (remembered choice, else by screen width). */
  view: View | null;
  range: RunningRange;
  goals: ComputedNutritionGoals;
  totals: DailyTotals;
  pace: { pace_min_per_km: number; source: "runs" | "oura" | "default" };
  carbsPerHour: number;
  plan: TrainingPlanView;
  fuelProducts: FuelProduct[];
  runExtras: Record<string, { laps: RunLap[]; stream: RunStreamPoints | null }>;
  /** The selected day's lifts and rides (the calendar entries cover the whole range). */
  lifts: TrainingLift[];
  rides: GarminActivity[];
  rideStreams: Record<string, RunStreamPoints>;
  /** The selected day's plan workouts (with matched state). */
  planWorkouts?: PlanWorkoutView[];
  /** The old dateless queue card — hidden once a dated plan exists. */
  showQueue?: boolean;
  /** The plan's next session after the selected day (for empty days). */
  nextUp?: PlanWorkoutView | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // No ?view= → remembered choice, else week on phones and month on wider screens.
  const preferred = useSyncExternalStore(subscribeWidth, preferredView, () => "month" as View);
  const [chosen, setChosen] = useState<View | null>(initialView);
  const view = chosen ?? preferred;
  const [hidden, setHidden] = useState<Set<PlanSport>>(new Set());
  const touch = useRef<{ x: number; y: number } | null>(null);

  function go(date: string, nextView: View = view) {
    const params = new URLSearchParams();
    if (date !== today) params.set("date", date);
    params.set("view", nextView);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function step(delta: number) {
    go(view === "week" ? addDays(selected, 7 * delta) : shiftMonth(selected, delta));
  }

  function chooseView(v: View) {
    setChosen(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // not remembered — fine
    }
    go(selected, v);
  }

  const week = datesBetween(weekStart(selected), addDays(weekStart(selected), 6));
  const days = view === "week" ? week : datesBetween(monthGridRange(selected).start, monthGridRange(selected).end);
  const month = selected.slice(0, 7);

  // A past planned run is history once that day has a logged run.
  const ranOn = new Set(range.entries.filter((e) => e.kind === "completed_run").map((e) => e.date));
  const visible = range.entries.filter((e) => !(e.kind === "planned_run" && e.date < today && ranOn.has(e.date)));
  const entriesByDate = new Map<string, CalendarEntry[]>();
  for (const e of visible) {
    if (hidden.has(entrySport(e))) continue;
    const list = entriesByDate.get(e.date) ?? [];
    list.push(e);
    entriesByDate.set(e.date, list);
  }
  for (const list of entriesByDate.values()) list.sort(byDoneThenSport);
  const statusByDate = new Map<string, Exclude<CalendarNutritionStatus, "none">>(
    range.adjustments.map((a) => [a.date, a.kind === "carb_load" ? "carb_load" : "fueling"]),
  );

  // The selected week at a glance: done vs still to do, per sport.
  const weekEntries = visible.filter((e) => e.date >= week[0]! && e.date <= week[6]!);
  const weekSummary = SPORTS.map((sp) => {
    const mine = weekEntries.filter((e) => entrySport(e) === sp.key && e.kind !== "race");
    const done = mine.filter(entryDone).length;
    const left = mine.filter((e) => !entryDone(e) && e.state !== "missed" && e.state !== "skipped" && e.date >= today).length;
    return { ...sp, done, left };
  }).filter((s) => s.done + s.left > 0);

  const heading =
    view === "week"
      ? `${formatIsoDateLabel(week[0]!, { month: "short", day: "numeric" })} – ${formatIsoDateLabel(week[6]!, { month: "short", day: "numeric" })}`
      : formatIsoDateLabel(`${month}-15`, { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      {showQueue ? <NextRunCard plan={plan} /> : null}

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={view === "week" ? "Previous week" : "Previous month"}
              onClick={() => step(-1)}
              className="text-text-muted hover:text-text-primary flex size-8 items-center justify-center rounded-md hover:bg-[rgba(255,255,255,0.06)]"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[9rem] text-center text-sm font-semibold">{heading}</span>
            <button
              type="button"
              aria-label={view === "week" ? "Next week" : "Next month"}
              onClick={() => step(1)}
              className="text-text-muted hover:text-text-primary flex size-8 items-center justify-center rounded-md hover:bg-[rgba(255,255,255,0.06)]"
            >
              <ChevronRight className="size-4" />
            </button>
            <Button
              type="button"
              variant="ghost"
              className={cn("ml-1 py-1.5", selected === today && "invisible")}
              onClick={() => go(today)}
            >
              Today
            </Button>
          </div>
          <div className="seg-control w-40">
            {(["week", "month"] as const).map((v) => (
              <button key={v} type="button" className={cn("seg-btn capitalize", view === v && "seg-btn-active")} onClick={() => chooseView(v)}>
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Sport legend doubles as a filter. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {SPORTS.map((sp) => {
            const off = hidden.has(sp.key);
            return (
              <button
                key={sp.key}
                type="button"
                aria-pressed={!off}
                onClick={() =>
                  setHidden((h) => {
                    const next = new Set(h);
                    if (next.has(sp.key)) next.delete(sp.key);
                    else next.add(sp.key);
                    return next;
                  })
                }
                className={cn(
                  "border-border flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  off ? "text-text-muted opacity-50" : "text-text-secondary hover:bg-[rgba(255,255,255,0.05)]",
                )}
              >
                <span className="size-2 rounded-sm" style={{ background: sp.color }} />
                {sp.label}
              </button>
            );
          })}
          <span className="text-text-muted ml-1 text-[11px]">Solid = done · outline = to do</span>
        </div>

        <div
          className="grid grid-cols-7 gap-1"
          onTouchStart={(e) => {
            touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY };
          }}
          onTouchEnd={(e) => {
            const t = touch.current;
            touch.current = null;
            if (!t) return;
            const dx = e.changedTouches[0]!.clientX - t.x;
            const dy = e.changedTouches[0]!.clientY - t.y;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
          }}
        >
          {WEEKDAYS.map((d) => (
            <span key={d} className="text-text-muted text-center text-[10px] uppercase tracking-wide">
              {d}
            </span>
          ))}
          {days.map((date) => {
            const entries = entriesByDate.get(date) ?? [];
            const status = statusByDate.get(date);
            const outside = view === "month" && !date.startsWith(month);
            const isSelected = date === selected;
            const inWeek = view === "month" && date >= week[0]! && date <= week[6]!;
            const max = view === "week" ? 6 : 3;
            return (
              <button
                key={date}
                type="button"
                onClick={() => go(date)}
                aria-pressed={isSelected}
                aria-label={`${formatIsoDateLabel(date)}${entries.length ? ` — ${entries.map((e) => entryText(e)).join(", ")}` : ""}`}
                className={cn(
                  "relative flex flex-col items-stretch gap-1 rounded-lg border p-1.5 text-left transition-colors",
                  view === "week" ? "min-h-[4.75rem] sm:min-h-[7.5rem]" : "min-h-[3.25rem] sm:min-h-[5.5rem]",
                  isSelected
                    ? "border-border-strong bg-[rgba(255,255,255,0.09)]"
                    : inWeek
                      ? "border-border bg-[rgba(255,255,255,0.035)] hover:bg-[rgba(255,255,255,0.06)]"
                      : "border-border hover:bg-[rgba(255,255,255,0.03)]",
                  outside && "opacity-40",
                )}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                      date === today ? "bg-text-primary font-bold text-[var(--color-background)]" : "text-text-secondary",
                    )}
                  >
                    {Number(date.slice(8))}
                  </span>
                  {status ? <FuelMark status={status} /> : null}
                </span>
                {/* Phones: one colored bar per session. Wider: labelled chips. */}
                <span className="flex flex-col gap-[3px] sm:hidden">
                  {entries.slice(0, 4).map((e) => (
                    <span key={e.id} className="h-[5px] rounded-full" style={markStyle(e)} />
                  ))}
                </span>
                <span className="hidden flex-col gap-0.5 sm:flex">
                  {entries.slice(0, max).map((e) => (
                    <EntryChip key={e.id} entry={e} />
                  ))}
                  {entries.length > max ? <span className="text-text-muted text-[10px]">+{entries.length - max} more</span> : null}
                </span>
              </button>
            );
          })}
        </div>

        <div className="border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <span className="text-text-muted">
              {view === "month" ? `Week of ${formatIsoDateLabel(week[0]!, { month: "short", day: "numeric" })}` : "This week"}
            </span>
            {weekSummary.length ? (
              weekSummary.map((s) => (
                <span key={s.key} className="tabular-nums" style={{ color: s.color }}>
                  {s.label}s {s.done} done{s.left ? ` · ${s.left} to do` : ""}
                </span>
              ))
            ) : (
              <span className="text-text-muted">Nothing logged or planned</span>
            )}
          </div>
          <div className="text-text-muted flex gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <Flag className="size-3" /> Race
            </span>
            {(Object.keys(NUTRITION_MARK) as (keyof typeof NUTRITION_MARK)[]).map((k) => (
              <span key={k} className="flex items-center gap-1">
                <FuelMark status={k} /> {NUTRITION_MARK[k].label}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <DayDetail
        date={selected}
        today={today}
        planned={range.planned.filter((p) => p.date === selected)}
        actual={range.actual.filter((a) => a.date === selected)}
        intakes={range.intakes.filter((i) => i.date === selected)}
        nextPlanRun={plan.next}
        adjustment={range.adjustments.find((a) => a.date === selected) ?? null}
        goals={goals}
        totals={totals}
        paceMinPerKm={pace.pace_min_per_km}
        fuelProducts={fuelProducts}
        runExtras={runExtras}
        lifts={lifts}
        rides={rides}
        rideStreams={rideStreams}
        planWorkouts={planWorkouts}
        dayEntries={visible.filter((e) => e.date === selected).sort(byDoneThenSport)}
        nextUp={nextUp}
      />

      <FuelSettings carbsPerHour={carbsPerHour} pace={pace} />
    </div>
  );
}

/** Fuel and carb-load days: monochrome icons, so they don't compete with sport colors. */
const NUTRITION_MARK = {
  fueling: { Icon: Zap, label: "Run fuel" },
  carb_load: { Icon: Wheat, label: "Carb load" },
} as const;

function FuelMark({ status }: { status: keyof typeof NUTRITION_MARK }) {
  const { Icon, label } = NUTRITION_MARK[status];
  return <Icon className="text-text-secondary size-3 shrink-0" aria-label={label} />;
}

function EntryChip({ entry }: { entry: CalendarEntry }) {
  const done = entryDone(entry);
  return (
    <span className="flex min-w-0 items-center gap-1 text-[10px] leading-tight">
      {entry.kind === "race" ? (
        <Flag className="size-3 shrink-0" style={{ color: SPORT_COLOR.run }} />
      ) : (
        <span className="size-2 shrink-0 rounded-full" style={markStyle(entry)} />
      )}
      <span
        className={cn(
          "truncate",
          entry.kind === "race" ? "text-text-primary font-semibold" : done ? "text-text-primary" : "text-text-muted",
          dimmed(entry) && "line-through",
        )}
      >
        {entryText(entry)}
      </span>
    </span>
  );
}

function FuelSettings({
  carbsPerHour,
  pace,
}: {
  carbsPerHour: number;
  pace: { pace_min_per_km: number; source: "runs" | "oura" | "default" };
}) {
  const { pending, error, run } = useRunAction();
  const [rate, setRate] = useState(String(carbsPerHour));
  return (
    <Card className="space-y-3">
      <span className="metric-label">Run & ride fuel settings</span>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={`Carbs per hour beyond the first (${MIN_CARBS_PER_HOUR}–${MAX_CARBS_PER_HOUR} g)`} className="w-64">
          <Input inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Button
          type="button"
          variant="solid"
          disabled={pending || Number(rate) === carbsPerHour}
          onClick={() => run(() => setRunFuelRateAction(Number(rate)), (v) => setRate(String(v)))}
        >
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
      <p className="text-text-muted text-xs">
        Easy pace for distance-only plans: {formatPace(pace.pace_min_per_km)} (
        {pace.source === "runs"
          ? "your logged easy runs"
          : pace.source === "oura"
            ? "Apple Health runs via Oura"
            : "default until you log runs"}
        ). Changing the rate re-runs today and upcoming fuel days. Past days stay as they were.
      </p>
      <FormError error={error} />
    </Card>
  );
}
