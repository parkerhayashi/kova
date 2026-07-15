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
  type WeightInsights as WeightInsightsData,
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

function StatCell({
  label,
  value,
  caption,
  valueColor,
}: {
  label: string;
  value: string;
  caption?: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <span className="metric-label">{label}</span>
      <p
        className="mt-1 text-base font-semibold tabular-nums text-text-primary"
        style={valueColor ? { color: valueColor } : undefined}
      >
        {value}
      </p>
      {caption ? (
        <p className="text-text-muted mt-0.5 text-[11px]">{caption}</p>
      ) : null}
    </div>
  );
}

function RatePill({
  rate,
  active,
  onClick,
}: {
  rate: RateWindow;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
        active
          ? "bg-[rgba(255,255,255,0.08)] text-text-primary"
          : "text-text-muted hover:text-text-secondary"
      }`}
    >
      {rate.id}
    </button>
  );
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
        <span className="metric-label">Trend insights</span>
        <p className="text-text-muted text-sm">
          Log at least a few weigh-ins to unlock weekly rate, pace, and goal ETA.
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

  const weekChart = insights.weeks.map((w) => ({
    label: w.label,
    value: w.avg_lbs,
  }));

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="metric-label">Pace</span>
            <p className="text-text-muted mt-1 text-xs">
              Rate from 7-day rolling averages so daily water noise is muted.
            </p>
          </div>
          <div className="flex gap-1 rounded-lg border border-border p-0.5">
            {insights.rates.map((r) => (
              <RatePill
                key={r.id}
                rate={r}
                active={selected.id === r.id}
                onClick={() => setWindowId(r.id)}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <div>
            <p
              className="metric-value text-3xl tabular-nums sm:text-4xl"
              style={{ color: deltaColor(selected.rate_lb_week) }}
            >
              {formatRateLbWeek(selected.rate_lb_week)}
            </p>
            <p className="text-text-muted mt-1 text-xs">
              {selected.label}
              {selected.delta_lbs != null
                ? ` · ${formatDeltaLbs(selected.delta_lbs)} lb total`
                : ""}
              {selected.used_rolling ? " · smoothed" : ""}
            </p>
          </div>
          <div className="pb-1">
            <p
              className="text-sm font-semibold"
              style={{ color: toneColor(pace.tone) }}
            >
              {pace.label}
            </p>
            {insights.goal ? (
              <p className="text-text-muted mt-0.5 text-xs">
                Goal {formatWeightLbs(insights.goal.goal_lbs)} lb
                {insights.goal.to_go_lbs !== 0
                  ? ` · ${formatDeltaLbs(insights.goal.to_go_lbs)} lb to go`
                  : " · at goal"}
                {insights.goal.eta_weeks != null
                  ? ` · ~${insights.goal.eta_weeks} wk at this pace`
                  : ""}
              </p>
            ) : (
              <p className="text-text-muted mt-0.5 text-xs">
                Set a weight goal on Nutrition to unlock ETA.
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {insights.rates.map((r) => (
            <StatCell
              key={r.id}
              label={`${r.id} rate`}
              value={formatRateLbWeek(r.rate_lb_week)}
              valueColor={deltaColor(r.rate_lb_week)}
              caption={
                r.delta_lbs != null
                  ? `${formatDeltaLbs(r.delta_lbs)} lb over ${r.actual_days}d`
                  : "Not enough data"
              }
            />
          ))}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Weight · 90 days"
          data={chartData}
          accent="activity"
          showAvg
          height={180}
          current={
            insights.avg_7d_lbs != null
              ? `${formatWeightLbs(insights.avg_7d_lbs)} avg`
              : insights.latest_lbs != null
                ? `${formatWeightLbs(insights.latest_lbs)} lb`
                : null
          }
          caption="Solid = daily · dashed = 7-day average"
        />
        <ChartCard
          title="Weekly averages"
          data={weekChart}
          accent="recovery"
          height={180}
          current={
            insights.weeks.length
              ? `${formatWeightLbs(insights.weeks[insights.weeks.length - 1]!.avg_lbs)} this week`
              : null
          }
          caption="Mean of weigh-ins in each calendar week"
        />
      </div>

      <Card className="space-y-4">
        <div>
          <span className="metric-label">Snapshot</span>
          <p className="text-text-muted mt-1 text-xs">
            Consistency and range make noise vs real trend easier to read.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCell
            label="7-day avg"
            value={
              insights.avg_7d_lbs != null
                ? `${formatWeightLbs(insights.avg_7d_lbs)} lb`
                : "—"
            }
          />
          <StatCell
            label="Streak"
            value={
              insights.streak_days > 0
                ? `${insights.streak_days} day${insights.streak_days === 1 ? "" : "s"}`
                : "—"
            }
          />
          <StatCell
            label="30d logged"
            value={
              insights.consistency_30d != null
                ? `${Math.round(insights.consistency_30d * 100)}%`
                : "—"
            }
            caption={
              insights.consistency_30d != null
                ? `${Math.round(insights.consistency_30d * 30)} of 30 days`
                : undefined
            }
          />
          <StatCell
            label="90d low"
            value={
              insights.low_90d_lbs != null
                ? `${formatWeightLbs(insights.low_90d_lbs)} lb`
                : "—"
            }
          />
          <StatCell
            label="90d high"
            value={
              insights.high_90d_lbs != null
                ? `${formatWeightLbs(insights.high_90d_lbs)} lb`
                : "—"
            }
          />
          <StatCell
            label="Day noise"
            value={
              insights.volatility_30d_lbs != null
                ? `±${insights.volatility_30d_lbs.toFixed(2)}`
                : "—"
            }
            caption="Stdev of day-to-day Δ"
          />
        </div>

        {insights.weeks.length > 0 ? (
          <div className="border-border overflow-hidden rounded-xl border">
            <div className="text-text-muted grid grid-cols-[1fr_4.5rem_4.5rem_3rem] gap-2 border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider">
              <span>Week</span>
              <span className="text-right">Avg</span>
              <span className="text-right">Δ wk</span>
              <span className="text-right">Logs</span>
            </div>
            <div className="divide-border max-h-64 divide-y overflow-y-auto">
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
        ) : null}

        {insights.goal ? <GoalBar insights={insights} /> : null}
      </Card>
    </div>
  );
}

function GoalBar({ insights }: { insights: WeightInsightsData }) {
  const goal = insights.goal!;
  const current = insights.avg_7d_lbs ?? insights.latest_lbs;
  if (current == null) return null;

  // Anchor progress to the farther of 90d extreme vs current, so the bar fills toward goal.
  const anchor =
    goal.direction === "cut"
      ? Math.max(insights.high_90d_lbs ?? current, current)
      : goal.direction === "bulk"
        ? Math.min(insights.low_90d_lbs ?? current, current)
        : current;

  let progressPct = 0;
  if (goal.direction === "maintain" || Math.abs(anchor - goal.goal_lbs) < 0.25) {
    progressPct = 100;
  } else if (goal.direction === "cut") {
    progressPct = ((anchor - current) / (anchor - goal.goal_lbs)) * 100;
  } else {
    progressPct = ((current - anchor) / (goal.goal_lbs - anchor)) * 100;
  }
  progressPct = Math.min(100, Math.max(0, progressPct));

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="metric-label">Goal track</span>
        <span className="text-text-muted text-xs tabular-nums">
          {formatWeightLbs(current)} → {formatWeightLbs(goal.goal_lbs)} lb
          {goal.to_go_lbs !== 0
            ? ` · ${formatDeltaLbs(goal.to_go_lbs)} lb`
            : ""}
        </span>
      </div>
      <div className="bg-surface-raised h-2 overflow-hidden rounded-full">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${progressPct}%`,
            background: "var(--color-activity)",
          }}
        />
      </div>
      {goal.eta_weeks != null ? (
        <p className="text-text-muted text-xs">
          At the 30-day pace, about{" "}
          <span className="text-text-secondary font-medium">
            {goal.eta_weeks} week{goal.eta_weeks === 1 ? "" : "s"}
          </span>{" "}
          to goal
          {goal.eta_weeks > 52 ? " (long road — pace compounds)" : ""}.
        </p>
      ) : goal.direction !== "maintain" ? (
        <p className="text-text-muted text-xs">
          Current pace isn&apos;t moving toward the goal yet — keep logging and
          give the 14–30 day rate time to settle.
        </p>
      ) : (
        <p className="text-text-muted text-xs">Within half a pound of goal.</p>
      )}
    </div>
  );
}
