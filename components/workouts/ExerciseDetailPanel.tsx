"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { LazyTrendChart as TrendChart } from "@/components/charts/lazyCharts";
import { ExerciseThumb } from "@/components/workouts/ExerciseThumb";
import {
  exerciseMuscles,
  formatHistoryDate,
  PROGRESS_METRICS,
  PROGRESS_PERIODS,
} from "@/lib/exercise-display";
import { cn } from "@/lib/utils";
import { estimate1RM, setVolume } from "@/lib/workouts";
import type { ExerciseHistorySession, ExerciseStats } from "@/types";

type Tab = "summary" | "history" | "howto";
type MetricId = (typeof PROGRESS_METRICS)[number]["id"];

type ProgressPoint = { date: string; label: string; value: number };

function sessionSetBadges(
  set: { weight_lbs: number | null; reps: number | null; is_warmup: boolean; completed: boolean },
  session: ExerciseHistorySession,
): string[] {
  if (set.is_warmup || !set.completed || set.weight_lbs == null || set.reps == null) {
    return [];
  }
  const badges: string[] = [];
  const vol = setVolume(set.weight_lbs, set.reps);
  const est = estimate1RM(set.weight_lbs, set.reps);

  let bestVol = 0;
  let best1rm = 0;
  for (const s of session.sets) {
    if (s.is_warmup || !s.completed || s.weight_lbs == null || s.reps == null) continue;
    bestVol = Math.max(bestVol, setVolume(s.weight_lbs, s.reps));
    best1rm = Math.max(best1rm, estimate1RM(s.weight_lbs, s.reps));
  }

  if (vol === bestVol && vol > 0) badges.push("Volume");
  if (est === best1rm && est > 0) badges.push("1RM");
  return badges;
}

export function ExerciseDetailPanel({
  exerciseId,
  onClose,
}: {
  exerciseId: string;
  onClose: () => void;
}) {
  const [stats, setStats] = useState<ExerciseStats | null>(null);
  const [history, setHistory] = useState<ExerciseHistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("summary");
  const [metric, setMetric] = useState<MetricId>("heaviest");
  const [periodDays, setPeriodDays] = useState(90);
  const [trend, setTrend] = useState<ProgressPoint[]>([]);
  const [setRecordsOpen, setSetRecordsOpen] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const res = await fetch(`/api/workouts/exercises/${exerciseId}`);
      if (res.ok) {
        const json = await res.json();
        setStats(json.stats ?? null);
        setHistory(json.history ?? []);
      }
      setLoading(false);
    })();
  }, [exerciseId]);

  useEffect(() => {
    if (tab !== "summary") return;
    void (async () => {
      const res = await fetch(
        `/api/workouts/exercises/${exerciseId}?view=progress&metric=${metric}&days=${periodDays}`,
      );
      if (!res.ok) return;
      const json = await res.json();
      setTrend(json.trend ?? []);
    })();
  }, [exerciseId, tab, metric, periodDays]);

  const muscles = useMemo(
    () => (stats ? exerciseMuscles(stats.exercise) : null),
    [stats],
  );

  const latestTrendValue =
    trend.length > 0 ? trend[trend.length - 1].value : null;

  const periodLabel =
    PROGRESS_PERIODS.find((p) => p.days === periodDays)?.label ?? "Last 3 months";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="border-b border-border px-4 py-3">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            ← Back
          </button>
          <h3 className="truncate text-base font-semibold text-text-primary">
            {stats?.exercise.name ?? "Exercise"}
          </h3>
          <span className="w-10" />
        </div>

        <div className="mx-auto mt-3 flex max-w-lg gap-4 border-b border-border">
          {(
            [
              ["summary", "Summary"],
              ["history", "History"],
              ["howto", "How to"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                "pb-2 text-sm font-medium transition-colors",
                tab === id
                  ? "border-b-2 border-text-primary text-text-primary"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-lg">
          {loading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : !stats ? (
            <p className="text-sm text-text-muted">Exercise not found.</p>
          ) : tab === "summary" ? (
            <div className="space-y-6">
              <div className="flex flex-col items-center text-center">
                <ExerciseThumb exercise={stats.exercise} size="lg" />
                <h4 className="mt-4 text-lg font-semibold text-text-primary">
                  {stats.exercise.name}
                </h4>
                {muscles ? (
                  <p className="mt-2 text-sm text-text-muted">
                    Primary:{" "}
                    <span className="text-text-secondary">{muscles.primary}</span>
                    {muscles.secondary.length > 0 ? (
                      <>
                        {" "}
                        · Secondary:{" "}
                        <span className="text-text-secondary">
                          {muscles.secondary.join(", ")}
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>

              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-text-secondary">
                    {latestTrendValue != null ? (
                      <>
                        <span className="font-mono text-[color:var(--color-recovery)]">
                          {latestTrendValue} lbs
                        </span>
                      </>
                    ) : (
                      <span className="text-text-muted">No data yet</span>
                    )}
                  </p>
                  <select
                    value={periodDays}
                    onChange={(e) => setPeriodDays(Number(e.target.value))}
                    className="field-input py-1.5 text-xs"
                  >
                    {PROGRESS_PERIODS.map((p) => (
                      <option key={p.days} value={p.days}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                {trend.length > 0 ? (
                  <TrendChart
                    data={trend.map((p) => ({ label: p.label, value: p.value }))}
                    accent="recovery"
                    height={160}
                  />
                ) : (
                  <Card className="border-dashed p-6 text-center text-sm text-text-muted">
                    Log more sessions to see progress over {periodLabel.toLowerCase()}.
                  </Card>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {PROGRESS_METRICS.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMetric(m.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        metric === m.id
                          ? "border-border-strong bg-[rgba(255,255,255,0.10)] text-text-primary"
                          : "border-border text-text-muted hover:text-text-secondary",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-[color:var(--color-activity)]">🏅</span>
                  <p className="metric-label">Personal records</p>
                </div>
                <ul className="divide-y divide-border rounded-xl border border-border">
                  <PrRow label="Heaviest weight" value={`${stats.heaviest_weight_lbs ?? "—"}lbs`} />
                  <PrRow label="Best 1RM" value={`${stats.best_est_1rm_lbs ?? "—"}lbs`} />
                  <PrRow
                    label="Best set volume"
                    value={
                      stats.best_set_volume_lbs != null
                        ? `${stats.best_set_volume_lbs}lbs`
                        : "—"
                    }
                  />
                  <PrRow
                    label="Best session volume"
                    value={
                      stats.best_session_volume_lbs != null
                        ? `${stats.best_session_volume_lbs}lbs`
                        : "—"
                    }
                  />
                </ul>
              </div>

              {stats.rep_records.length > 0 ? (
                <div>
                  <button
                    type="button"
                    className="mb-2 flex w-full items-center justify-between"
                    onClick={() => setSetRecordsOpen((o) => !o)}
                  >
                    <p className="metric-label">Set records</p>
                    <span className="text-text-muted">{setRecordsOpen ? "▾" : "▸"}</span>
                  </button>
                  {setRecordsOpen ? (
                    <div className="overflow-hidden rounded-xl border border-border">
                      <div className="grid grid-cols-2 bg-[rgba(255,255,255,0.03)] px-3 py-2 text-xs font-semibold text-text-secondary">
                        <span>Reps</span>
                        <span className="text-right">Personal best</span>
                      </div>
                      {stats.rep_records.map((r) => (
                        <div
                          key={r.reps}
                          className="grid grid-cols-2 border-t border-border px-3 py-2.5 text-sm"
                        >
                          <span className="text-text-secondary">{r.reps}</span>
                          <span className="text-right font-mono text-[color:var(--color-recovery)]">
                            {r.weight_lbs}lbs
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : tab === "history" ? (
            <div className="space-y-4">
              {history.length === 0 ? (
                <p className="text-sm text-text-muted">No history yet.</p>
              ) : (
                history.map((session) => (
                  <Card key={session.session_id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-text-primary">
                          {session.title ?? "Workout"}
                        </p>
                        <p className="text-xs text-text-muted">
                          {formatHistoryDate(session.date)}
                        </p>
                      </div>
                      <span className="text-text-muted">›</span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <ExerciseThumb exercise={stats.exercise} size="sm" />
                      <p className="text-sm font-medium text-text-primary">
                        {stats.exercise.name}
                      </p>
                    </div>

                    <div className="mt-3 grid grid-cols-[2rem_1fr] gap-x-3 gap-y-2 text-xs">
                      <span className="metric-label">Set</span>
                      <span className="metric-label">Weight & reps</span>
                      {session.sets
                        .filter((s) => s.completed && !s.is_warmup)
                        .map((set) => {
                          const badges = sessionSetBadges(set, session);
                          return (
                            <div key={set.id} className="contents">
                              <span className="text-sm text-text-secondary">
                                {set.set_index + 1}
                              </span>
                              <div>
                                <p className="text-sm text-text-primary">
                                  {set.weight_lbs} lbs × {set.reps}
                                </p>
                                {badges.length > 0 ? (
                                  <div className="mt-0.5 flex flex-wrap gap-1">
                                    {badges.map((b) => (
                                      <span
                                        key={b}
                                        className="inline-flex items-center gap-0.5 text-[10px] text-[color:var(--color-activity)]"
                                      >
                                        🏅 {b}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </Card>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <ExerciseThumb exercise={stats.exercise} size="lg" className="mx-auto" />
              <div>
                <h4 className="font-semibold text-text-primary">{stats.exercise.name}</h4>
                {stats.exercise.equipment ? (
                  <p className="mt-1 text-sm text-text-muted">
                    Equipment: {stats.exercise.equipment}
                  </p>
                ) : null}
                {muscles ? (
                  <p className="mt-2 text-sm text-text-secondary">
                    Primary: {muscles.primary}
                    {muscles.secondary.length > 0
                      ? ` · Secondary: ${muscles.secondary.join(", ")}`
                      : ""}
                  </p>
                ) : null}
              </div>
              <Card className="border-dashed p-4 text-sm text-text-muted">
                Step-by-step instructions and video demos can be linked here when
                ExerciseDB IDs are populated for your library.
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PrRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between px-3 py-3 text-sm">
      <span className="text-text-secondary">{label}</span>
      <span className="font-mono text-[color:var(--color-recovery)]">{value}</span>
    </li>
  );
}
