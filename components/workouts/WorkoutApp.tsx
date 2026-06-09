"use client";

import { useCallback, useEffect, useState } from "react";
import { Coach } from "@/components/coach/Coach";
import { ActiveWorkout } from "@/components/workouts/ActiveWorkout";
import { CoachDayBanner } from "@/components/workouts/CoachDayBanner";
import { ExerciseDetailPanel } from "@/components/workouts/ExerciseDetailPanel";
import { LiftingStats } from "@/components/workouts/LiftingStats";
import { RoutineList } from "@/components/workouts/RoutineList";
import { SessionDetailPanel } from "@/components/workouts/SessionDetailPanel";
import { PageHeader } from "@/components/PageHeader";
import { readTodaySplit } from "@/lib/coach-bridge";
import type {
  ActiveWorkoutView,
  LiftingDashboard,
  RoutineDetail,
  WorkoutSession,
} from "@/types";

type WorkoutsPayload = {
  routines: RoutineDetail[];
  activeWorkout: ActiveWorkoutView | null;
  recentSessions: WorkoutSession[];
  dashboard: LiftingDashboard;
};

const EMPTY_DASHBOARD: LiftingDashboard = {
  period_days: 28,
  total_sessions: 0,
  total_sets: 0,
  total_volume_lbs: 0,
  current_streak_days: 0,
  volume_by_day: [],
  muscle_split: [],
};

export function WorkoutApp() {
  const [data, setData] = useState<WorkoutsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewSessionId, setViewSessionId] = useState<string | null>(null);
  const [viewExerciseId, setViewExerciseId] = useState<string | null>(null);
  const [coachRefreshKey, setCoachRefreshKey] = useState(0);
  const [todaySplit, setTodaySplit] = useState<string | null>(null);

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
    setTodaySplit(readTodaySplit()?.name ?? null);
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
      prev
        ? { ...prev, activeWorkout: workout }
        : {
            routines: [],
            activeWorkout: workout,
            recentSessions: [],
            dashboard: EMPTY_DASHBOARD,
          },
    );
  }

  function handleWorkoutUpdate(workout: ActiveWorkoutView | null) {
    setData((prev) => (prev ? { ...prev, activeWorkout: workout } : prev));
  }

  function handleComplete() {
    setData((prev) => (prev ? { ...prev, activeWorkout: null } : prev));
    setCoachRefreshKey((k) => k + 1);
    void refresh();
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Workouts"
        subtitle="Train with your Push / Pull / Legs routines. Coach tracks progressive overload and syncs when you finish a session."
      />

      {error ? (
        <p className="text-sm text-[color:var(--color-stress)]">{error}</p>
      ) : null}

      {!data?.activeWorkout && !loading ? (
        <CoachDayBanner
          routines={data?.routines ?? []}
          onStartRoutine={startRoutine}
        />
      ) : null}

      <section>
        {loading ? (
          <p className="body-copy text-text-muted">Loading routines…</p>
        ) : data?.activeWorkout ? (
          <ActiveWorkout
            workout={data.activeWorkout}
            onUpdate={handleWorkoutUpdate}
            onComplete={handleComplete}
          />
        ) : (
          <>
            <RoutineList
              routines={data?.routines ?? []}
              recentSessions={data?.recentSessions ?? []}
              onStart={startRoutine}
              onViewSession={setViewSessionId}
              onViewExercise={setViewExerciseId}
              highlightRoutineName={todaySplit}
            />
            {data?.dashboard ? <LiftingStats dashboard={data.dashboard} /> : null}
          </>
        )}
      </section>

      <section className="border-t border-border pt-8">
        <header className="mb-4">
          <h2 className="text-base font-semibold text-text-primary">
            Progressive overload
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Weight tracking, prescriptions, and lift history. Top sets from
            finished Train sessions sync here automatically.
          </p>
        </header>
        <Coach refreshKey={coachRefreshKey} />
      </section>

      {viewSessionId ? (
        <SessionDetailPanel
          sessionId={viewSessionId}
          onClose={() => setViewSessionId(null)}
        />
      ) : null}
      {viewExerciseId ? (
        <ExerciseDetailPanel
          exerciseId={viewExerciseId}
          onClose={() => setViewExerciseId(null)}
        />
      ) : null}
    </div>
  );
}
