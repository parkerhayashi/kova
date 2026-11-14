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
  type WeightHistoryRange,
} from "@/lib/weight-history";
import { todayInTimezone, formatIsoDateLabel, normalizeIsoDate } from "@/lib/utils";
import type { WeightLog } from "@/types";

const RANGES: { id: WeightHistoryRange; label: string }[] = [
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
  { id: "all", label: "All" },
];

function formatDayLabel(iso: string): string {
  return formatIsoDateLabel(iso);
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
          source?: WeightLog["source"];
        }[];
      };
      setLogs(
        (json.entries ?? []).flatMap((e) => {
          const date = normalizeIsoDate(e.dateKey);
          if (!date) return [];
          return [
            {
              id: date,
              date,
              weight_lbs: e.weight_lbs,
              body_fat_pct: e.body_fat_pct,
              notes: e.notes,
              source: e.source ?? "kova",
              external_id: null,
              measured_at: null,
              metrics: null,
              created_at: "",
            },
          ];
        }),
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
  const rangeBounds = useMemo(() => {
    if (!filtered.length) return null;
    let low = filtered[0]!.weight_lbs;
    let high = low;
    for (const r of filtered) {
      low = Math.min(low, r.weight_lbs);
      high = Math.max(high, r.weight_lbs);
    }
    return { low, high };
  }, [filtered]);

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

      {loaded && filtered.length > 0 ? (
        <p className="text-text-muted text-xs">
          {filtered.length} weigh-in{filtered.length === 1 ? "" : "s"} in this
          range
          {rangeBounds
            ? ` · ${formatWeightLbs(rangeBounds.low)}–${formatWeightLbs(rangeBounds.high)} lb`
            : ""}
        </p>
      ) : null}

      {!loaded ? (
        <p className="text-text-muted text-sm">Loading history…</p>
      ) : rows.length === 0 ? (
        <p className="text-text-muted text-sm">
          No weigh-ins in this range yet. Log one above to start the history.
        </p>
      ) : (
        <div className="border-border overflow-hidden rounded-xl border">
          <div className="text-text-muted grid grid-cols-[1fr_4.5rem_4.5rem_2rem] gap-2 border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-wider">
            <span>Date</span>
            <span className="text-right">Weight</span>
            <span className="text-right">Δ day</span>
            <span className="sr-only">Delete</span>
          </div>
          <div className="divide-border max-h-[28rem] divide-y overflow-y-auto">
            {rows.map((row) => (
              <div
                key={row.date}
                className="grid grid-cols-[1fr_4.5rem_4.5rem_2rem] items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-[rgba(255,255,255,0.03)]"
              >
                <Link
                  href={`${editPath}?date=${row.date}`}
                  className="min-w-0"
                >
                  <span className="block font-medium text-text-primary">
                    {formatDayLabel(row.date)}
                  </span>
                  {row.body_fat_pct != null || row.source === "garmin" ? (
                    <span className="text-text-muted text-xs">
                      {[
                        row.body_fat_pct != null ? `${row.body_fat_pct.toFixed(1)}% body fat` : null,
                        row.source === "garmin" ? "Garmin" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
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
                  className="text-right text-xs tabular-nums"
                  style={{ color: deltaColor(row.delta_lbs) }}
                >
                  {formatDeltaLbs(row.delta_lbs)}
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
