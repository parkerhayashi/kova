/**
 * Weight trend analytics — rates, weekly pace, goal ETA.
 * Prefers 7-day rolling averages so single noisy weigh-ins don't dominate.
 */
import {
  computeWeightTrendFromEntries,
  rollingAverageWeight,
  type WeightEntry,
} from "@/lib/coach-composition";
import { addDays } from "@/lib/utils";
import type { WeightLog } from "@/types";

export type RateWindow = {
  id: "7d" | "14d" | "30d" | "90d";
  label: string;
  days: number;
  /** Total change across the window (end avg − start avg), lb. */
  delta_lbs: number | null;
  /** Average change per calendar week, lb/week. */
  rate_lb_week: number | null;
  /** Span of days actually used (may be shorter than requested). */
  actual_days: number;
  used_rolling: boolean;
};

export type WeekBucket = {
  /** Monday of the week (ISO date). */
  week_start: string;
  label: string;
  avg_lbs: number;
  count: number;
  /** Change vs prior week's average. */
  delta_lbs: number | null;
};

export type GoalPace = {
  goal_lbs: number;
  current_lbs: number;
  to_go_lbs: number;
  /** lb/week needed to hit goal by a soft target (null if not computed). */
  needed_lb_week: number | null;
  /** Weeks to goal at the 30d (fallback 14d) rate; null if wrong direction / stalled. */
  eta_weeks: number | null;
  direction: "cut" | "bulk" | "maintain";
};

export type WeightInsights = {
  latest_lbs: number | null;
  latest_date: string | null;
  avg_7d_lbs: number | null;
  rates: RateWindow[];
  /** Primary storytelling rate — 14d when possible, else best available. */
  primary_rate_lb_week: number | null;
  primary_rate_label: string | null;
  weeks: WeekBucket[];
  /** Last 90 days of daily points + trailing 7d avg for charts. */
  series: { date: string; weight_lbs: number; avg_7d_lbs: number | null }[];
  goal: GoalPace | null;
  /** Consecutive days ending on latest weigh-in with a log (calendar). */
  streak_days: number;
  /** Share of last 30 calendar days that have a weigh-in (0–1). */
  consistency_30d: number | null;
  low_90d_lbs: number | null;
  high_90d_lbs: number | null;
  /** Stdev of day-to-day deltas in last 30d — water noise proxy. */
  volatility_30d_lbs: number | null;
  count: number;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toWeightEntries(logs: WeightLog[]): WeightEntry[] {
  return [...logs]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => ({ dateKey: l.date, weight: l.weight_lbs }));
}

function mondayOf(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  const day = dt.getDay(); // 0 Sun … 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return (
    dt.getFullYear() +
    "-" +
    String(dt.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(dt.getDate()).padStart(2, "0")
  );
}

function weekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function computeRateWindows(entries: WeightEntry[]): RateWindow[] {
  const specs: { id: RateWindow["id"]; label: string; days: number }[] = [
    { id: "7d", label: "7 days", days: 7 },
    { id: "14d", label: "14 days", days: 14 },
    { id: "30d", label: "30 days", days: 30 },
    { id: "90d", label: "90 days", days: 90 },
  ];

  return specs.map((spec) => {
    const trend = computeWeightTrendFromEntries(entries, spec.days);
    if (!trend || trend.actualDays < 3) {
      return {
        id: spec.id,
        label: spec.label,
        days: spec.days,
        delta_lbs: null,
        rate_lb_week: null,
        actual_days: trend?.actualDays ?? 0,
        used_rolling: false,
      };
    }
    const weeks = trend.actualDays / 7;
    return {
      id: spec.id,
      label: spec.label,
      days: spec.days,
      delta_lbs: round1(trend.weightDelta),
      rate_lb_week: weeks > 0 ? round2(trend.weightDelta / weeks) : null,
      actual_days: trend.actualDays,
      used_rolling: trend.usedRollingWeight,
    };
  });
}

export function computeWeeklyBuckets(entries: WeightEntry[]): WeekBucket[] {
  if (!entries.length) return [];

  const byWeek = new Map<string, number[]>();
  for (const e of entries) {
    const key = mondayOf(e.dateKey);
    const list = byWeek.get(key) ?? [];
    list.push(e.weight);
    byWeek.set(key, list);
  }

  const weeks = [...byWeek.keys()].sort((a, b) => a.localeCompare(b));
  const buckets: WeekBucket[] = [];

  for (let i = 0; i < weeks.length; i++) {
    const week_start = weeks[i]!;
    const weights = byWeek.get(week_start)!;
    const avg = weights.reduce((s, w) => s + w, 0) / weights.length;
    const prior = i > 0 ? buckets[i - 1]!.avg_lbs : null;
    buckets.push({
      week_start,
      label: weekLabel(week_start),
      avg_lbs: round1(avg),
      count: weights.length,
      delta_lbs: prior != null ? round1(avg - prior) : null,
    });
  }

  return buckets;
}

function computeStreak(sortedDates: string[]): number {
  if (!sortedDates.length) return 0;
  const set = new Set(sortedDates);
  let cursor = sortedDates[sortedDates.length - 1]!;
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function dayToDayVolatility(entries: WeightEntry[], today: string): number | null {
  const start = addDays(today, -29);
  const slice = entries.filter((e) => e.dateKey >= start);
  if (slice.length < 3) return null;
  const deltas: number[] = [];
  for (let i = 1; i < slice.length; i++) {
    deltas.push(slice[i]!.weight - slice[i - 1]!.weight);
  }
  const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const variance =
    deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / deltas.length;
  return round2(Math.sqrt(variance));
}

function computeGoalPace(
  current_lbs: number,
  goal_lbs: number,
  rate_lb_week: number | null,
): GoalPace {
  const to_go = round1(goal_lbs - current_lbs);
  let direction: GoalPace["direction"] = "maintain";
  if (Math.abs(to_go) <= 0.5) direction = "maintain";
  else if (to_go < 0) direction = "cut";
  else direction = "bulk";

  let eta_weeks: number | null = null;
  if (rate_lb_week != null && Math.abs(rate_lb_week) >= 0.05) {
    const towardGoal =
      (direction === "cut" && rate_lb_week < 0) ||
      (direction === "bulk" && rate_lb_week > 0);
    if (towardGoal) {
      eta_weeks = round1(Math.abs(to_go) / Math.abs(rate_lb_week));
    }
  }

  return {
    goal_lbs,
    current_lbs: round1(current_lbs),
    to_go_lbs: to_go,
    needed_lb_week: null,
    eta_weeks,
    direction,
  };
}

/** Pace category relative to ~0.5–1% bodyweight/week (common cut guidance). */
export function classifyPace(
  rate_lb_week: number | null,
  current_lbs: number | null,
  direction: GoalPace["direction"] | null,
): { label: string; tone: "good" | "warn" | "idle" } {
  if (rate_lb_week == null || current_lbs == null) {
    return { label: "Need more data", tone: "idle" };
  }

  if (!direction) {
    if (Math.abs(rate_lb_week) <= 0.25) return { label: "Holding steady", tone: "good" };
    return {
      label: rate_lb_week < 0 ? "Losing" : "Gaining",
      tone: "idle",
    };
  }

  if (direction === "maintain") {
    if (Math.abs(rate_lb_week) <= 0.25) return { label: "Stable", tone: "good" };
    return { label: rate_lb_week > 0 ? "Drifting up" : "Drifting down", tone: "warn" };
  }

  const pct = (Math.abs(rate_lb_week) / current_lbs) * 100;
  const toward =
    (direction === "cut" && rate_lb_week < 0) ||
    (direction === "bulk" && rate_lb_week > 0);

  if (!toward) {
    return {
      label: direction === "cut" ? "Gaining on a cut" : "Losing on a bulk",
      tone: "warn",
    };
  }

  if (direction === "cut") {
    if (pct < 0.3) return { label: "Slow cut", tone: "warn" };
    if (pct <= 1.0) return { label: "Solid cut pace", tone: "good" };
    return { label: "Aggressive cut", tone: "warn" };
  }

  // bulk
  if (pct < 0.15) return { label: "Slow bulk", tone: "warn" };
  if (pct <= 0.5) return { label: "Solid bulk pace", tone: "good" };
  return { label: "Fast bulk", tone: "warn" };
}

export function computeWeightInsights(
  logs: WeightLog[],
  today: string,
  goalLbs: number | null = null,
): WeightInsights {
  const ascending = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const entries = toWeightEntries(ascending);

  if (!ascending.length) {
    return {
      latest_lbs: null,
      latest_date: null,
      avg_7d_lbs: null,
      rates: computeRateWindows([]),
      primary_rate_lb_week: null,
      primary_rate_label: null,
      weeks: [],
      series: [],
      goal: null,
      streak_days: 0,
      consistency_30d: null,
      low_90d_lbs: null,
      high_90d_lbs: null,
      volatility_30d_lbs: null,
      count: 0,
    };
  }

  const latest = ascending[ascending.length - 1]!;
  const avg7 = rollingAverageWeight(entries, latest.date, 7);
  const rates = computeRateWindows(entries);

  const primary =
    rates.find((r) => r.id === "14d" && r.rate_lb_week != null) ??
    rates.find((r) => r.id === "30d" && r.rate_lb_week != null) ??
    rates.find((r) => r.rate_lb_week != null) ??
    null;

  const start90 = addDays(today, -89);
  const in90 = ascending.filter((r) => r.date >= start90);
  let low90: number | null = null;
  let high90: number | null = null;
  for (const row of in90) {
    low90 = low90 == null ? row.weight_lbs : Math.min(low90, row.weight_lbs);
    high90 = high90 == null ? row.weight_lbs : Math.max(high90, row.weight_lbs);
  }

  const seriesStart = addDays(today, -89);
  const seriesEntries = entries.filter((e) => e.dateKey >= seriesStart);
  const series = seriesEntries.map((e) => ({
    date: e.dateKey,
    weight_lbs: e.weight,
    avg_7d_lbs: rollingAverageWeight(entries, e.dateKey, 7),
  }));

  const dates30 = new Set(
    ascending.filter((r) => r.date >= addDays(today, -29)).map((r) => r.date),
  );
  const consistency =
    ascending.length > 0 ? round2(dates30.size / 30) : null;

  const refWeight = avg7 ?? latest.weight_lbs;
  const rateForGoal =
    rates.find((r) => r.id === "30d")?.rate_lb_week ??
    primary?.rate_lb_week ??
    null;

  return {
    latest_lbs: latest.weight_lbs,
    latest_date: latest.date,
    avg_7d_lbs: avg7 != null ? round1(avg7) : null,
    rates,
    primary_rate_lb_week: primary?.rate_lb_week ?? null,
    primary_rate_label: primary?.label ?? null,
    weeks: computeWeeklyBuckets(entries).slice(-12),
    series: series.map((p) => ({
      ...p,
      avg_7d_lbs: p.avg_7d_lbs != null ? round1(p.avg_7d_lbs) : null,
      weight_lbs: round1(p.weight_lbs),
    })),
    goal:
      goalLbs != null && Number.isFinite(goalLbs)
        ? computeGoalPace(refWeight, goalLbs, rateForGoal)
        : null,
    streak_days: computeStreak(ascending.map((r) => r.date)),
    consistency_30d: consistency,
    low_90d_lbs: low90 != null ? round1(low90) : null,
    high_90d_lbs: high90 != null ? round1(high90) : null,
    volatility_30d_lbs: dayToDayVolatility(entries, today),
    count: ascending.length,
  };
}

export function formatRateLbWeek(rate: number | null): string {
  if (rate == null) return "—";
  if (Math.abs(rate) < 0.05) return "0.0 lb/wk";
  const sign = rate > 0 ? "+" : "";
  return `${sign}${rate.toFixed(2)} lb/wk`;
}
