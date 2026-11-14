import { addDays } from "@/lib/utils";
import type { WeightLog } from "@/types";

export type WeightHistoryRange = "30d" | "90d" | "all";

export type WeightHistoryRow = {
  source: WeightLog["source"];
  date: string;
  weight_lbs: number;
  body_fat_pct: number | null;
  notes: string | null;
  /** Change vs prior weigh-in (chronologically previous). */
  delta_lbs: number | null;
  /** 7-day trailing average ending on this date (among logged days). */
  avg_7d_lbs: number | null;
};

export type WeightHistorySummary = {
  latest_lbs: number | null;
  latest_date: string | null;
  avg_7d_lbs: number | null;
  change_30d_lbs: number | null;
  low_lbs: number | null;
  high_lbs: number | null;
  count: number;
};

export function filterWeightLogs(
  logs: WeightLog[],
  range: WeightHistoryRange,
  today: string,
): WeightLog[] {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  if (range === "all") return sorted;
  const days = range === "30d" ? 30 : 90;
  const start = addDays(today, -(days - 1));
  return sorted.filter((row) => row.date >= start);
}

/** Newest-first rows with day-to-day delta and trailing 7-entry avg. */
export function buildWeightHistoryRows(logs: WeightLog[]): WeightHistoryRow[] {
  const ascending = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const rows: WeightHistoryRow[] = [];

  for (let i = 0; i < ascending.length; i++) {
    const row = ascending[i]!;
    const prior = i > 0 ? ascending[i - 1] : null;
    const window = ascending.slice(Math.max(0, i - 6), i + 1);
    const avg =
      window.reduce((sum, r) => sum + r.weight_lbs, 0) / window.length;

    rows.push({
      date: row.date,
      weight_lbs: row.weight_lbs,
      body_fat_pct: row.body_fat_pct,
      notes: row.notes,
      source: row.source,
      delta_lbs:
        prior != null
          ? Math.round((row.weight_lbs - prior.weight_lbs) * 10) / 10
          : null,
      avg_7d_lbs: Math.round(avg * 10) / 10,
    });
  }

  return rows.reverse();
}

export function summarizeWeightLogs(
  logs: WeightLog[],
  today: string,
): WeightHistorySummary {
  if (!logs.length) {
    return {
      latest_lbs: null,
      latest_date: null,
      avg_7d_lbs: null,
      change_30d_lbs: null,
      low_lbs: null,
      high_lbs: null,
      count: 0,
    };
  }

  const ascending = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const latest = ascending[ascending.length - 1]!;
  const last7 = ascending.slice(-7);
  const avg_7d_lbs =
    Math.round(
      (last7.reduce((sum, r) => sum + r.weight_lbs, 0) / last7.length) * 10,
    ) / 10;

  const start30 = addDays(today, -29);
  const in30 = ascending.filter((r) => r.date >= start30);
  const change_30d_lbs =
    in30.length >= 2
      ? Math.round(
          (in30[in30.length - 1]!.weight_lbs - in30[0]!.weight_lbs) * 10,
        ) / 10
      : null;

  let low = ascending[0]!.weight_lbs;
  let high = ascending[0]!.weight_lbs;
  for (const row of ascending) {
    low = Math.min(low, row.weight_lbs);
    high = Math.max(high, row.weight_lbs);
  }

  return {
    latest_lbs: latest.weight_lbs,
    latest_date: latest.date,
    avg_7d_lbs,
    change_30d_lbs,
    low_lbs: Math.round(low * 10) / 10,
    high_lbs: Math.round(high * 10) / 10,
    count: ascending.length,
  };
}

export function formatWeightLbs(lbs: number): string {
  return Number.isInteger(lbs) ? String(lbs) : lbs.toFixed(1);
}

export function formatDeltaLbs(delta: number | null): string {
  if (delta == null) return "—";
  if (delta === 0) return "0.0";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}`;
}
