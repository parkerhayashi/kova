"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  buildWeightHistoryRows,
  filterWeightLogs,
  formatDeltaLbs,
  formatWeightLbs,
  summarizeWeightLogs,
  type WeightHistoryRange,
} from "@/lib/weight-history";
import { todayInTimezone } from "@/lib/utils";
import type { WeightLog } from "@/types";

const RANGES: { id: WeightHistoryRange; label: string }[] = [
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All" },
];

function formatDayLabel(iso: string, timeZone: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone,
  });
}

function deltaColor(delta: number | null): string | undefined {
  if (delta == null || delta === 0) return undefined;
  // During a cut, down is "good" — use recovery green for loss, stress for gain.
  return delta < 0 ? "var(--color-recovery)" : "var(--color-stress)";
}

export function WeightHistory({
  initialLogs,
  timezone = "America/New_York",
  editPath = "/weight",
}: {
  initialLogs?: WeightLog[];
  timezone?: string;
  /** Path used when opening a day to edit (date query appended). */
  editPath?: string;
}) {
  const [logs, setLogs] = useState<WeightLog[]>(initialLogs ?? []);
  const [range, setRange] = useState<WeightHistoryRange>("30d");
  const [loaded, setLoaded] = useState(Boolean(initialLogs));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const today = todayInTimezone(timezone);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/weight/logs?unit=lb", { cache: "no-store" });
      if (!res.ok) throw new Error("Could not load weight history.");
      const json = (await res.json()) as {
        entries: {
          dateKey: string;
          weight_lbs: number;
          body_fat_pct: number | null;
          notes: string | null;
        }[];
      };
      setLogs(
        (json.entries ?? []).map((e) => ({
          id: e.dateKey,
          date: e.dateKey,
          weight_lbs: e.weight_lbs,
          body_fat_pct: e.body_fat_pct,
          notes: e.notes,
          created_at: "",
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (initialLogs) {
      setLogs(initialLogs);
      setLoaded(true);
      return;
    }
    void refresh();
  }, [initialLogs, refresh]);

  const filtered = useMemo(
    () => filterWeightLogs(logs, range, today),
    [logs, range, today],
  );
  const rows = useMemo(() => buildWeightHistoryRows(filtered), [filtered]);
  const summary = useMemo(
    () => summarizeWeightLogs(filtered, today),
    [filtered, today],
  );

  function remove(date: string) {
    startTransition(async () => {
      setError(null);
      const res = await fetch("/api/weight/log", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });
      if (!res.ok) {
        setError("Could not delete weigh-in.");
        return;
      }
      setLogs((prev) => prev.filter((row) => row.date !== date));
    });
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className="metric-label">Weigh-in log</span>
          <p className="text-text-muted mt-1 text-xs">
            Day-by-day history with change vs the previous weigh-in.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                range === r.id
                  ? "bg-[rgba(255,255,255,0.08)] text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loaded && summary.count > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryCell
            label="Latest"
            value={
              summary.latest_lbs != null
                ? `${formatWeightLbs(summary.latest_lbs)} lb`
                : "—"
            }
            caption={
              summary.latest_date
                ? formatDayLabel(summary.latest_date, timezone)
                : undefined
            }
          />
          <SummaryCell
            label="7-day avg"
            value={
              summary.avg_7d_lbs != null
                ? `${formatWeightLbs(summary.avg_7d_lbs)} lb`
                : "—"
            }
          />
          <SummaryCell
            label="30d change"
            value={formatDeltaLbs(summary.change_30d_lbs)}
            valueColor={deltaColor(summary.change_30d_lbs)}
            unit={summary.change_30d_lbs != null ? " lb" : undefined}
          />
          <SummaryCell
            label="Range"
            value={
              summary.low_lbs != null && summary.high_lbs != null
                ? `${formatWeightLbs(summary.low_lbs)}–${formatWeightLbs(summary.high_lbs)}`
                : "—"
            }
            caption={`${summary.count} weigh-in${summary.count === 1 ? "" : "s"}`}
          />
        </div>
      ) : null}

      {!loaded ? (
        <p className="text-text-muted text-sm">Loading history…</p>
      ) : rows.length === 0 ? (
        <p className="text-text-muted text-sm">
          No weigh-ins in this range yet. Log one above to start the history.
        </p>
      ) : (
        <div className="border-border overflow-hidden rounded-xl border">
          <div className="text-text-muted grid grid-cols-[1fr_4.5rem_4.5rem_2rem] gap-2 border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider sm:grid-cols-[1fr_5rem_5rem_5rem_2rem]">
            <span>Date</span>
            <span className="text-right">Weight</span>
            <span className="text-right">Δ day</span>
            <span className="hidden text-right sm:block">7d avg</span>
            <span className="sr-only">Delete</span>
          </div>
          <div className="divide-border max-h-[28rem] divide-y overflow-y-auto">
            {rows.map((row) => (
              <div
                key={row.date}
                className="grid grid-cols-[1fr_4.5rem_4.5rem_2rem] items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-[rgba(255,255,255,0.03)] sm:grid-cols-[1fr_5rem_5rem_5rem_2rem]"
              >
                <Link
                  href={`${editPath}?date=${row.date}`}
                  className="min-w-0"
                >
                  <span className="block font-medium text-text-primary">
                    {formatDayLabel(row.date, timezone)}
                  </span>
                  {row.body_fat_pct != null ? (
                    <span className="text-text-muted text-xs">
                      {row.body_fat_pct.toFixed(1)}% body fat
                    </span>
                  ) : null}
                </Link>
                <span
                  className="text-right font-semibold tabular-nums"
                  style={{ color: "var(--color-activity)" }}
                >
                  {formatWeightLbs(row.weight_lbs)}
                </span>
                <span
                  className="text-right font-mono text-xs tabular-nums"
                  style={{ color: deltaColor(row.delta_lbs) }}
                >
                  {formatDeltaLbs(row.delta_lbs)}
                </span>
                <span className="text-text-muted hidden text-right font-mono text-xs tabular-nums sm:block">
                  {row.avg_7d_lbs != null
                    ? formatWeightLbs(row.avg_7d_lbs)
                    : "—"}
                </span>
                <button
                  type="button"
                  onClick={() => remove(row.date)}
                  disabled={pending}
                  aria-label={`Delete weigh-in ${row.date}`}
                  className="text-text-muted hover:text-[var(--color-stress)] inline-flex size-8 items-center justify-center rounded-lg transition-colors disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <p className="text-xs text-[var(--color-stress)]">{error}</p>
      ) : null}
    </Card>
  );
}

function SummaryCell({
  label,
  value,
  caption,
  unit,
  valueColor,
}: {
  label: string;
  value: string;
  caption?: string;
  unit?: string;
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
        {unit ? (
          <span className="text-text-muted text-xs font-normal">{unit}</span>
        ) : null}
      </p>
      {caption ? (
        <p className="text-text-muted mt-0.5 text-[11px]">{caption}</p>
      ) : null}
    </div>
  );
}
