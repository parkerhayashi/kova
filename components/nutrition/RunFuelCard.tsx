import Link from "next/link";
import { Card } from "@/components/ui/Card";
import type { DailyTotals } from "@/lib/nutrition";
import {
  formatGelRange,
  formatRunDuration,
  overageLines,
  raceTitle,
  suggestedGels,
  type MacroTargets,
  type RunDayMeta,
} from "@/lib/run-fuel";
import { formatIsoDateLabel } from "@/lib/utils";
import type { MidRunIntake } from "@/types";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const signed = (n: number) => `${n >= 0 ? "+" : "−"} ${fmt(Math.abs(n))}`;

/**
 * The day's run-fuel line, shown apart from the base target so it's always
 * clear what the run added and why. Renders nothing on Mode 1 days.
 */
export function RunFuelCard({
  date,
  runDay,
  targets,
  totals,
  intakes = [],
  showRunningLink = false,
}: {
  date: string;
  runDay: RunDayMeta | null;
  targets: MacroTargets;
  totals: DailyTotals;
  intakes?: Pick<MidRunIntake, "id" | "label" | "carbs_g" | "kcal">[];
  showRunningLink?: boolean;
}) {
  if (!runDay || (!runDay.fuel && !runDay.adjustment_removed)) return null;
  const fuel = runDay.fuel;
  const overages = overageLines(totals, targets);
  const gelCarbs = intakes.reduce((s, i) => s + i.carbs_g, 0);
  const gelKcal = intakes.reduce((s, i) => s + i.kcal, 0);

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="metric-label">
          {fuel?.kind === "carb_load"
            ? `Carb load · day ${fuel.load_day_index ?? 1} of ${fuel.load_day_count ?? 1}`
            : fuel
              ? `Run fuel · ${fuel.basis === "actual" ? "actual" : "estimated"}`
              : "Run fuel removed"}
        </span>
        {showRunningLink ? (
          <Link
            href={`/running?date=${date}`}
            className="text-text-muted hover:text-text-primary text-xs underline-offset-2 hover:underline"
          >
            Running →
          </Link>
        ) : null}
      </div>

      {fuel?.kind === "carb_load" ? (
        <div className="space-y-1.5 text-sm">
          <p className="text-text-secondary tabular-nums">
            Base {fmt(fuel.base.calories)} {signed(fuel.added_kcal)} load ={" "}
            <span className="text-text-primary font-semibold">
              {fmt(targets.calories)} kcal
            </span>
          </p>
          <p className="text-text-secondary tabular-nums">
            Carbs{" "}
            <span style={{ color: "var(--color-activity)" }} className="font-semibold">
              {fmt(targets.carbs_g)} g
            </span>
            {fuel.carbs_g_per_kg ? ` (${fuel.carbs_g_per_kg} g/kg)` : ""} · Fat{" "}
            {fmt(targets.fat_g)} g · Protein {fmt(targets.protein_g)} g
          </p>
          <p className="text-text-muted text-xs">
            {raceTitle({ race_name: fuel.event_name, event_type: fuel.event_type }, fuel.event_distance_km)}
            {fuel.event_date ? ` on ${formatIsoDateLabel(fuel.event_date)}` : ""}.
            The calorie rise is intentional. It isn&apos;t an overage, and load days
            are exempt from the cut deficit and the adaptive TDEE review.
          </p>
        </div>
      ) : fuel ? (
        <div className="space-y-1.5 text-sm">
          <p className="text-text-secondary tabular-nums">
            Base {fmt(fuel.base.calories)} + Run fuel {fmt(fuel.added_kcal)} ={" "}
            <span className="text-text-primary font-semibold">
              {fmt(targets.calories)} kcal
            </span>
          </p>
          <p className="text-text-secondary tabular-nums">
            Carbs {fmt(fuel.base.carbs_g)} + {fmt(fuel.added_carbs_g)} ={" "}
            <span style={{ color: "var(--color-activity)" }} className="font-semibold">
              {fmt(targets.carbs_g)} g
            </span>{" "}
            · protein and fat unchanged
          </p>
          <p className="text-text-muted text-xs">
            {fuel.basis === "actual"
              ? `Reconciled to the actual run (${formatRunDuration(fuel.basis_duration_min)}).`
              : `Estimated from the planned ${formatRunDuration(fuel.basis_duration_min)} — reconciles once the actual run is in.`}
            {runDay.unplanned ? " Unplanned run, credited from the actual." : ""}{" "}
            Mid-run: {formatGelRange(suggestedGels(fuel.basis_duration_min))}.
          </p>
          {fuel.event_date === date ? <RaceDayGuidance /> : null}
        </div>
      ) : (
        <p className="text-text-muted text-sm">
          The planned run was skipped or came in under the fueling threshold, so
          this day is back to base targets. Meals already logged don&apos;t
          change.
        </p>
      )}

      {intakes.length > 0 ? (
        <p className="text-text-muted text-xs tabular-nums">
          On-run fuel logged: {intakes.length} item{intakes.length === 1 ? "" : "s"} ·{" "}
          {fmt(gelCarbs)} g carbs · {fmt(gelKcal)} kcal (counted in the day&apos;s
          totals).
        </p>
      ) : null}

      {overages.length > 0 && fuel?.kind !== "carb_load" ? (
        <ul className="space-y-0.5 text-xs" style={{ color: "var(--color-stress)" }}>
          {overages.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}

export function RaceDayGuidance() {
  return (
    <ul className="text-text-muted list-disc space-y-0.5 pl-4 text-xs">
      <li>
        Pre-race meal 2–3 h before: familiar, low-fiber, low-fat carbs, about
        100–150 g.
      </li>
      <li>During: gels at 30–60 g carbs/h, about 1 per 30–45 min. Log them below.</li>
      <li>After: protein plus carbs within a couple of hours.</li>
    </ul>
  );
}
