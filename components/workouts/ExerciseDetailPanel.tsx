"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import type { ExerciseHistorySession, ExerciseStats } from "@/types";

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

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <Card className="max-h-[85vh] w-full max-w-lg overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-text-primary">
            {stats?.exercise.name ?? "Exercise"}
          </h3>
          <button
            type="button"
            className="text-text-muted hover:text-text-primary"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-text-muted">Loading…</p>
        ) : stats ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Heaviest" value={`${stats.heaviest_weight_lbs ?? "—"} lb`} />
              <Stat label="Best est. 1RM" value={`${stats.best_est_1rm_lbs ?? "—"} lb`} />
              <Stat label="Best set vol." value={`${stats.best_set_volume_lbs ?? "—"} lb`} />
              <Stat
                label="Best session vol."
                value={`${stats.best_session_volume_lbs ?? "—"} lb`}
              />
            </div>

            <div className="text-xs text-text-muted">
              {stats.total_sessions} sessions · {stats.total_sets} sets
              {stats.last_performed ? ` · last ${stats.last_performed}` : ""}
            </div>

            {stats.rep_records.length > 0 ? (
              <div>
                <p className="metric-label mb-2">Rep records</p>
                <ul className="space-y-1 text-sm">
                  {stats.rep_records.map((r) => (
                    <li key={r.reps} className="flex justify-between text-text-secondary">
                      <span>{r.reps} reps</span>
                      <span className="text-[color:var(--color-recovery)]">
                        {r.weight_lbs} lb
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {history.length > 0 ? (
              <div>
                <p className="metric-label mb-2">History</p>
                <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                  {history.map((h) => (
                    <li key={h.session_id} className="border-t border-border pt-2">
                      <div className="flex justify-between text-text-primary">
                        <span>{h.date}</span>
                        <span className="text-text-muted">
                          {h.session_volume_lbs.toLocaleString()} lb
                          {h.best_est_1rm_lbs != null
                            ? ` · 1RM ${h.best_est_1rm_lbs}`
                            : ""}
                        </span>
                      </div>
                      <p className="text-xs text-text-muted">
                        {h.sets
                          .filter((s) => s.completed && !s.is_warmup)
                          .map((s) => `${s.weight_lbs}×${s.reps}`)
                          .join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-text-muted">Exercise not found.</p>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-3">
      <p className="metric-label">{label}</p>
      <p className="mt-1 text-sm font-medium text-[color:var(--color-recovery)]">{value}</p>
    </div>
  );
}
