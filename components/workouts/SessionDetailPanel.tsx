"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { formatDuration } from "@/lib/utils";
import type { ActiveWorkoutView } from "@/types";

export function SessionDetailPanel({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const [session, setSession] = useState<ActiveWorkoutView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const res = await fetch(`/api/workouts/sessions/${sessionId}`);
      if (res.ok) {
        setSession((await res.json()) as ActiveWorkoutView);
      }
      setLoading(false);
    })();
  }, [sessionId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <Card className="max-h-[85vh] w-full max-w-lg overflow-y-auto">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-medium text-text-primary">
            {session?.session.title ?? "Session"}
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
        ) : session ? (
          <div className="space-y-4">
            <div className="flex gap-4 text-sm text-text-secondary">
              <span>{session.session.date}</span>
              <span>{formatDuration(session.session.duration)}</span>
              <span className="text-[color:var(--color-activity)]">
                {session.total_volume_lbs.toLocaleString()} lb
              </span>
            </div>

            <ul className="space-y-3">
              {session.exercises.map((ex) => {
                const logged = ex.sets.filter((s) => s.completed && !s.is_warmup);
                return (
                  <li key={ex.session_exercise_id} className="border-t border-border pt-3">
                    <p className="font-medium text-text-primary">{ex.exercise.name}</p>
                    {logged.length === 0 ? (
                      <p className="text-xs text-text-muted">No sets logged</p>
                    ) : (
                      <ul className="mt-1 space-y-0.5 text-sm text-text-secondary">
                        {logged.map((set) => (
                          <li key={set.id}>
                            Set {set.set_index + 1}: {set.weight_lbs} lb × {set.reps}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Session not found.</p>
        )}
      </Card>
    </div>
  );
}
