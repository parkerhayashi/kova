"use client";

import { useCallback, useEffect, useState } from "react";
import { Coach } from "@/components/coach/Coach";
import { ActiveWorkout } from "@/components/workouts/ActiveWorkout";
import { RoutineList } from "@/components/workouts/RoutineList";
import { PageHeader } from "@/components/PageHeader";
import { cn } from "@/lib/utils";
import type { ActiveWorkoutView, RoutineDetail, WorkoutSession } from "@/types";

type Tab = "train" | "coach";

type WorkoutsPayload = {
  routines: RoutineDetail[];
  activeWorkout: ActiveWorkoutView | null;
  recentSessions: WorkoutSession[];
};

export function WorkoutApp() {
  const [tab, setTab] = useState<Tab>("train");
  const [data, setData] = useState<WorkoutsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/workouts");
      if (!res.ok) throw new Error("Failed to load workouts");
      const json = (await res.json()) as WorkoutsPayload;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startRoutine(routineId: string) {
    setError(null);
    const res = await fetch("/api/workouts/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", routine_id: routineId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Could not start workout");
      return;
    }
    const workout = (await res.json()) as ActiveWorkoutView;
    setData((prev) =>
      prev ? { ...prev, activeWorkout: workout } : { routines: [], activeWorkout: workout, recentSessions: [] },
    );
  }

  function handleWorkoutUpdate(workout: ActiveWorkoutView | null) {
    setData((prev) => (prev ? { ...prev, activeWorkout: workout } : prev));
  }

  function handleComplete() {
    setData((prev) =>
      prev ? { ...prev, activeWorkout: null } : prev,
    );
    void refresh();
  }

  return (
    <div>
      <PageHeader
        title="Workouts"
        subtitle="Log sets, track rest, and run your Push / Pull / Legs split."
      />

      <div className="mb-6 flex gap-1 rounded-lg border border-border bg-[rgba(255,255,255,0.02)] p-1">
        {(["train", "coach"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium capitalize transition-colors",
              tab === t
                ? "bg-[rgba(255,255,255,0.08)] text-text-primary"
                : "text-text-secondary hover:text-text-primary",
            )}
          >
            {t === "train" ? "Train" : "Coach"}
          </button>
        ))}
      </div>

      {tab === "coach" ? (
        <Coach />
      ) : (
        <div className="space-y-4">
          {error ? (
            <p className="text-sm text-[color:var(--color-stress)]">{error}</p>
          ) : null}

          {loading ? (
            <p className="body-copy text-text-muted">Loading routines…</p>
          ) : data?.activeWorkout ? (
            <ActiveWorkout
              workout={data.activeWorkout}
              onUpdate={handleWorkoutUpdate}
              onComplete={handleComplete}
            />
          ) : (
            <RoutineList
              routines={data?.routines ?? []}
              recentSessions={data?.recentSessions ?? []}
              onStart={startRoutine}
            />
          )}
        </div>
      )}
    </div>
  );
}
