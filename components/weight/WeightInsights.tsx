"use client";

import { useMemo, useState } from "react";
import { ChartCard } from "@/components/charts/ChartCard";
import { Card } from "@/components/ui/Card";
import { formatWeightLbs, formatDeltaLbs } from "@/lib/weight-history";
import {
  classifyPace,
  computeWeightInsights,
  formatRateLbWeek,
  type RateWindow,
} from "@/lib/weight-stats";
import { shortDate } from "@/lib/utils";
import type { WeightLog } from "@/types";

function deltaColor(delta: number | null): string | undefined {
  if (delta == null || delta === 0) return undefined;
  return delta < 0 ? "var(--color-recovery)" : "var(--color-stress)";
}

function toneColor(tone: "good" | "warn" | "idle"): string {
  if (tone === "good") return "var(--color-recovery)";
  if (tone === "warn") return "var(--color-activity)";
  return "var(--color-text-muted)";
}

export function WeightInsights({
  logs,
  today,
  goalLbs,
}: {
  logs: WeightLog[];
  today: string;
  goalLbs: number | null;
}) {
  const insights = useMemo(
    () => computeWeightInsights(logs, today, goalLbs),
    [logs, today, goalLbs],
  );
  const [windowId, setWindowId] = useState<RateWindow["id"]>("14d");

  if (insights.count < 2) {
    return (
      <Card className="space-y-2">
        <span className="metric-label">Pace</span>
        <p className="text-text-muted text-sm">
          Log a few more weigh-ins to see weekly rate and trend.
        </p>
      </Card>
    );
  }

  const selected =
    insights.rates.find((r) => r.id === windowId && r.rate_lb_week != null) ??
    insights.rates.find((r) => r.rate_lb_week != null) ??
    insights.rates[0]!;

  const pace = classifyPace(
    selected.rate_lb_week,
    insights.avg_7d_lbs ?? insights.latest_lbs,
    insights.goal?.direction ?? null,
  );

  const chartData = insights.series.map((p) => ({
    label: shortDate(p.date),
    value: p.weight_lbs,
    avg: p.avg_7d_lbs,
  }));

  const current = insights.avg_7d_lbs ?? insights.latest_lbs;
  const goal = insights.goal;

  let progressPct: number | null = null;
  if (goal && current != null && goal.direction !== "maintain") {
    const anchor =
      goal.direction === "cut"
        ? Math.max(insights.high_90d_lbs ?? current, current)
        : Math.min(insights.low_90d_lbs ?? current, current);
    if (Math.abs(anchor - goal.goal_lbs) >= 0.25) {
      progressPct =
        goal.direction === "cut"
          ? ((anchor - current) / (anchor - goal.goal_lbs)) * 100
          : ((current - anchor) / (goal.goal_lbs - anchor)) * 100;
      progressPct = Math.min(100, Math.max(0, progressPct));
    } else {
      progressPct = 100;
    }
  } else if (goal?.direction === "maintain") {
    progressPct = 100;
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="metric-label">Pace</span>
            <p className="text-text-muted mt-1 text-xs">
              Smoothed with 7-day averages so daily water noise is muted.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {insights.rates.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setWindowId(r.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  selected.id === r.id
                    ? "bg-[rgba(255,255,255,0.08)] text-text-primary"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                {r.id}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p
              className="metric-value text-3xl tabular-nums sm:text-4xl"
              style={{ color: deltaColor(selected.rate_lb_week) }}
            >
              {formatRateLbWeek(selected.rate_lb_week)}
            </p>
            <p className="text-text-muted mt-1 text-xs">
              <span style={{ color: toneColor(pace.tone) }} className="font-semibold">
                {pace.label}
              </span>
              {selected.delta_lbs != null
                ? ` · ${formatDeltaLbs(selected.delta_lbs)} lb over ${selected.actual_days}d`
                : ""}
            </p>
          </div>

          <div className="text-right text-xs">
            {insights.avg_7d_lbs != null ? (
              <p className="text-text-secondary tabular-nums">
                7-day avg{" "}
                <span className="text-text-primary font-semibold">
                  {formatWeightLbs(insights.avg_7d_lbs)} lb
                </span>
              </p>
            ) : null}
            {goal ? (
              <p className="text-text-muted mt-0.5 tabular-nums">
                Goal {formatWeightLbs(goal.goal_lbs)} lb
                {goal.to_go_lbs !== 0
                  ? ` · ${formatDeltaLbs(goal.to_go_lbs)}`
                  : " · at goal"}
                {goal.eta_weeks != null ? ` · ~${goal.eta_weeks} wk` : ""}
              </p>
            ) : null}
            <p className="text-text-muted mt-0.5">
              {insights.streak_days > 0
                ? `${insights.streak_days}d streak`
                : "No streak"}
              {insights.consistency_30d != null
                ? ` · ${Math.round(insights.consistency_30d * 100)}% logged (30d)`
                : ""}
              {insights.volatility_30d_lbs != null
                ? ` · ±${insights.volatility_30d_lbs.toFixed(2)} noise`
                : ""}
            </p>
          </div>
        </div>

        {progressPct != null && goal ? (
          <div className="bg-surface-raised h-1.5 overflow-hidden rounded-full">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progressPct}%`,
                background: "var(--color-activity)",
              }}
            />
          </div>
        ) : null}
      </Card>

      <ChartCard
        title="Trend · 90 days"
        data={chartData}
        accent="activity"
        showAvg
        height={180}
        caption="Solid = daily · dashed = 7-day average"
      />

      {insights.weeks.length > 1 ? (
        <Card className="space-y-3">
          <div>
            <span className="metric-label">Week by week</span>
            <p className="text-text-muted mt-1 text-xs">
              Average of weigh-ins each week, and change vs the prior week.
            </p>
          </div>
          <div className="border-border overflow-hidden rounded-xl border">
            <div className="text-text-muted grid grid-cols-[1fr_4.5rem_4.5rem_3rem] gap-2 border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider">
              <span>Week</span>
              <span className="text-right">Avg</span>
              <span className="text-right">Δ wk</span>
              <span className="text-right">Logs</span>
            </div>
            <div className="divide-border max-h-56 divide-y overflow-y-auto">
              {[...insights.weeks].reverse().map((w) => (
                <div
                  key={w.week_start}
                  className="grid grid-cols-[1fr_4.5rem_4.5rem_3rem] items-center gap-2 px-3 py-2 text-sm"
                >
                  <span className="font-medium text-text-primary">
                    Week of {w.label}
                  </span>
                  <span
                    className="text-right font-semibold tabular-nums"
                    style={{ color: "var(--color-activity)" }}
                  >
                    {formatWeightLbs(w.avg_lbs)}
                  </span>
                  <span
                    className="text-right font-mono text-xs tabular-nums"
                    style={{ color: deltaColor(w.delta_lbs) }}
                  >
                    {formatDeltaLbs(w.delta_lbs)}
                  </span>
                  <span className="text-text-muted text-right text-xs tabular-nums">
                    {w.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
