"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { setRunFuelRateAction } from "@/app/(dashboard)/running/actions";
import { DayDetail } from "@/components/running/DayDetail";
import { FormError, useRunAction } from "@/components/running/RunForms";
import { NextRunCard } from "@/components/running/TrainingPlan";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import type { RunningRange, TrainingPlanView } from "@/lib/data/running";
import type { DailyTotals } from "@/lib/nutrition";
import type { ComputedNutritionGoals } from "@/lib/nutrition-goals";
import {
  formatDistance,
  formatPace,
  MAX_CARBS_PER_HOUR,
  MIN_CARBS_PER_HOUR,
} from "@/lib/run-fuel";
import { monthGridRange, weekStart } from "@/lib/run-calendar";
import { addDays, cn, formatIsoDateLabel } from "@/lib/utils";
import type { CalendarEntry, CalendarNutritionStatus } from "@/types";

type View = "week" | "month";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Nutrition markers are data → semantic accents are allowed on the dot. */
const NUTRITION_DOT: Record<Exclude<CalendarNutritionStatus, "none">, { color: string; label: string }> = {
  fueling: { color: "var(--color-activity)", label: "Run fuel" },
  carb_load: { color: "var(--color-nutrition)", label: "Carb load" },
};

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

export function RunningApp({
  today,
  selected,
  view: initialView,
  range,
  goals,
  totals,
  pace,
  carbsPerHour,
  plan,
}: {
  today: string;
  selected: string;
  view: View;
  range: RunningRange;
  goals: ComputedNutritionGoals;
  totals: DailyTotals;
  pace: { pace_min_per_km: number; source: "runs" | "oura" | "default" };
  carbsPerHour: number;
  plan: TrainingPlanView;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [view, setView] = useState<View>(initialView);

  function go(date: string, nextView: View = view) {
    const params = new URLSearchParams();
    if (date !== today) params.set("date", date);
    if (nextView === "week") params.set("view", "week");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const days =
    view === "week"
      ? datesBetween(weekStart(selected), addDays(weekStart(selected), 6))
      : datesBetween(monthGridRange(selected).start, monthGridRange(selected).end);
  const month = selected.slice(0, 7);

  const entriesByDate = new Map<string, CalendarEntry[]>();
  for (const e of range.entries) {
    const list = entriesByDate.get(e.date) ?? [];
    list.push(e);
    entriesByDate.set(e.date, list);
  }
  const statusByDate = new Map<string, Exclude<CalendarNutritionStatus, "none">>(
    range.adjustments.map((a) => [a.date, a.kind === "carb_load" ? "carb_load" : "fueling"]),
  );

  const heading =
    view === "week"
      ? `Week of ${formatIsoDateLabel(weekStart(selected), { month: "short", day: "numeric" })}`
      : formatIsoDateLabel(`${month}-15`, { month: "long", year: "numeric" });

  return (
    <div className="space-y-6">
      <NextRunCard plan={plan} />

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Previous"
              onClick={() => go(view === "week" ? addDays(selected, -7) : shiftMonth(selected, -1))}
              className="text-text-muted hover:text-text-primary flex size-8 items-center justify-center rounded-md hover:bg-[rgba(255,255,255,0.06)]"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="min-w-[10rem] text-center text-sm font-semibold">{heading}</span>
            <button
              type="button"
              aria-label="Next"
              onClick={() => go(view === "week" ? addDays(selected, 7) : shiftMonth(selected, 1))}
              className="text-text-muted hover:text-text-primary flex size-8 items-center justify-center rounded-md hover:bg-[rgba(255,255,255,0.06)]"
            >
              <ChevronRight className="size-4" />
            </button>
            {selected !== today ? (
              <Button type="button" variant="ghost" className="ml-1 py-1.5" onClick={() => go(today)}>
                Today
              </Button>
            ) : null}
          </div>
          <div className="seg-control w-40">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                type="button"
                className={cn("seg-btn capitalize", view === v && "seg-btn-active")}
                onClick={() => {
                  setView(v);
                  go(selected, v);
                }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
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
            return (
              <button
                key={date}
                type="button"
                onClick={() => go(date)}
                aria-pressed={isSelected}
                aria-label={formatIsoDateLabel(date)}
                className={cn(
                  "relative flex flex-col items-stretch gap-1 rounded-lg border p-1.5 text-left transition-colors",
                  view === "week" ? "min-h-[7.5rem]" : "min-h-[3.5rem] sm:min-h-[5.5rem]",
                  isSelected
                    ? "border-border-strong bg-[rgba(255,255,255,0.07)]"
                    : "border-border hover:bg-[rgba(255,255,255,0.03)]",
                  outside && "opacity-40",
                )}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      date === today ? "font-bold text-text-primary" : "text-text-secondary",
                    )}
                  >
                    {Number(date.slice(8))}
                  </span>
                  {status ? (
                    <span
                      className="size-2 rounded-full"
                      style={{ background: NUTRITION_DOT[status].color }}
                      aria-label={NUTRITION_DOT[status].label}
                    />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "flex flex-col gap-0.5",
                    view === "month" && "max-sm:flex-row max-sm:flex-wrap max-sm:gap-1",
                  )}
                >
                  {entries.slice(0, view === "week" ? 5 : 3).map((e) => (
                    <EntryChip key={e.id} entry={e} compact={view === "month"} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <div className="text-text-muted flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-white" /> Planned
          </span>
          <span className="flex items-center gap-1.5">
            <Flag className="size-3" /> Race
          </span>
          <span className="flex items-center gap-1.5">
            <Check className="size-3" /> Completed
          </span>
          {Object.values(NUTRITION_DOT).map((d) => (
            <span key={d.label} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: d.color }} /> {d.label}
            </span>
          ))}
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
      />

      <FuelSettings carbsPerHour={carbsPerHour} pace={pace} />
    </div>
  );
}

function EntryChip({ entry, compact }: { entry: CalendarEntry; compact: boolean }) {
  const icon =
    entry.kind === "race" ? (
      <Flag className="size-3 shrink-0" />
    ) : entry.kind === "completed_run" ? (
      <Check className="size-3 shrink-0" />
    ) : (
      <span className="size-1.5 shrink-0 rounded-full bg-white" />
    );
  const text =
    entry.kind === "race"
      ? entry.label
      : entry.planned_distance_km != null
        ? formatDistance(entry.planned_distance_km)
        : entry.label;
  return (
    <span
      className={cn(
        "flex min-w-0 items-center gap-1 text-[10px] leading-tight",
        "text-text-secondary",
        entry.kind === "race" && "font-semibold text-text-primary",
      )}
    >
      {icon}
      <span className={cn("truncate", compact && "max-sm:hidden")}>{text}</span>
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
      <span className="metric-label">Run fuel settings</span>
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
