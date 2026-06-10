"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ActiveWorkout } from "@/components/workouts/ActiveWorkout";
import { CoachDayBanner } from "@/components/workouts/CoachDayBanner";
import { CoachWeight } from "@/components/coach/CoachPanel";
import { ExerciseDetailPanel } from "@/components/workouts/ExerciseDetailPanel";
import { LiftingStats } from "@/components/workouts/LiftingStats";
import { RoutineEditor } from "@/components/workouts/RoutineEditor";
import { RoutineList } from "@/components/workouts/RoutineList";
import { SessionDetailPanel } from "@/components/workouts/SessionDetailPanel";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { CLIENT_SYNC_CHANGED_EVENT } from "@/lib/client-sync";
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
  const [editRoutineId, setEditRoutineId] = useState<string | null>(null);
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

    function onCoachChange(e: Event) {
      const ns = (e as CustomEvent<{ namespace?: string }>).detail?.namespace;
      if (ns === "coach") {
        setTodaySplit(readTodaySplit()?.name ?? null);
      }
    }
    window.addEventListener(CLIENT_SYNC_CHANGED_EVENT, onCoachChange);
    return () => window.removeEventListener(CLIENT_SYNC_CHANGED_EVENT, onCoachChange);
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
    setTodaySplit(readTodaySplit()?.name ?? null);
    void refresh();
  }

  function handleRoutineUpdated(routine: RoutineDetail) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        routines: prev.routines.map((r) =>
          r.id === routine.id ? routine : r,
        ),
      };
    });
  }

  const inSession = Boolean(data?.activeWorkout);

  if (editRoutineId) {
    return (
      <RoutineEditor
        routineId={editRoutineId}
        onClose={() => setEditRoutineId(null)}
        onUpdated={handleRoutineUpdated}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={inSession ? "Live workout" : "Workouts"}
        subtitle={
          inSession
            ? "Log every set here. Coach targets update as you finish."
            : "Start a live session to log sets, reps, and rest. Import past workouts coming later."
        }
      />

      {error ? (
        <p className="text-sm text-[color:var(--color-stress)]">{error}</p>
      ) : null}

      {!inSession && !loading ? (
        <>
          <CoachWeight />
          <CoachDayBanner
            routines={data?.routines ?? []}
            onStartRoutine={startRoutine}
          />
          <div className="flex flex-wrap gap-3 text-sm">
            <Link
              href="/workouts/body"
              className="text-text-secondary hover:text-text-primary"
            >
              Progress photos & split settings →
            </Link>
          </div>
        </>
      ) : null}

      <section>
        {loading ? (
          <p className="body-copy text-text-muted">Loading…</p>
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
              onEdit={setEditRoutineId}
              onViewSession={setViewSessionId}
              onViewExercise={setViewExerciseId}
              highlightRoutineName={todaySplit}
            />
            {data?.dashboard ? <LiftingStats dashboard={data.dashboard} /> : null}
            <Card className="border-dashed p-4">
              <p className="metric-label">Import past workouts</p>
              <p className="mt-1 text-sm text-text-muted">
                Manual entry or Hevy export — coming in a later update.
              </p>
            </Card>
          </>
        )}
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
