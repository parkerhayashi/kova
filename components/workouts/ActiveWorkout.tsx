"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RestTimer } from "@/components/workouts/RestTimer";
import { CoachPrescriptionBadge } from "@/components/workouts/CoachPrescriptionBadge";
import { SetLogger } from "@/components/workouts/SetLogger";
import { WorkoutTimer } from "@/components/workouts/WorkoutTimer";
import {
  getPrescriptionForTrainExercise,
  syncSessionToCoach,
} from "@/lib/coach-bridge";
import { cn } from "@/lib/utils";
import { formatRepRange, formatRest, sessionVolumeLbs } from "@/lib/workouts";
import type { ActiveWorkoutView, Exercise, SessionExerciseView } from "@/types";

export function ActiveWorkout({
  workout,
  onUpdate,
  onComplete,
}: {
  workout: ActiveWorkoutView;
  onUpdate: (workout: ActiveWorkoutView | null) => void;
  onComplete: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(
    workout.exercises[0]?.session_exercise_id ?? null,
  );
  const [restSeconds, setRestSeconds] = useState<number | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<SessionExerciseView | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Exercise[]>([]);
  const [busy, setBusy] = useState(false);

  const volume = sessionVolumeLbs(workout.exercises);

  async function apiAction(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch("/api/workouts/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const json = await res.json();
      return (json.workout ?? json) as ActiveWorkoutView | { ok: boolean };
    } finally {
      setBusy(false);
    }
  }

  async function finishWorkout() {
    if (!confirm("Finish this workout? Top sets sync to Coach.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workouts/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "complete",
          session_id: workout.session.id,
        }),
      });
      if (res.ok) {
        syncSessionToCoach(workout);
        onComplete();
      }
    } finally {
      setBusy(false);
    }
  }

  async function cancelWorkout() {
    if (!confirm("Discard this workout? Sets won't be saved.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workouts/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "cancel",
          session_id: workout.session.id,
        }),
      });
      if (res.ok) onUpdate(null);
    } finally {
      setBusy(false);
    }
  }

  async function moveExercise(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= workout.exercises.length) return;
    const ordered = [...workout.exercises];
    [ordered[index], ordered[next]] = [ordered[next], ordered[index]];
    const result = await apiAction({
      action: "reorder",
      session_id: workout.session.id,
      ordered_ids: ordered.map((e) => e.session_exercise_id),
    });
    if (result && "session" in result) onUpdate(result);
  }

  async function searchExercises(q: string) {
    setSearchQ(q);
    const res = await fetch(`/api/workouts/exercises?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const json = await res.json();
    setSearchResults(json.exercises ?? []);
  }

  async function confirmReplace(exerciseId: string) {
    if (!replaceTarget) return;
    const result = await apiAction({
      action: "replace_exercise",
      session_id: workout.session.id,
      session_exercise_id: replaceTarget.session_exercise_id,
      exercise_id: exerciseId,
    });
    if (result && "session" in result) {
      onUpdate(result);
      setReplaceTarget(null);
      setSearchQ("");
      setSearchResults([]);
    }
  }

  return (
    <div className="space-y-4 pb-24">
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {workout.session.title ?? "Workout"}
          </h2>
          <p className="text-sm text-text-secondary">
            {workout.exercises.length} exercises ·{" "}
            <span className="text-[color:var(--color-activity)]">{volume.toLocaleString()} lb</span>{" "}
            volume
          </p>
        </div>
        <WorkoutTimer startedAt={workout.session.started_at} />
      </Card>

      <div className="space-y-3">
        {workout.exercises.map((ex, index) => {
          const open = expandedId === ex.session_exercise_id;
          const loggedSets = ex.sets.filter((s) => s.completed).length;
          const coachRx = getPrescriptionForTrainExercise(
            ex,
            workout.session.title,
          );
          return (
            <Card key={ex.session_exercise_id} className="p-4">
              <button
                type="button"
                className="flex w-full items-start justify-between gap-3 text-left"
                onClick={() =>
                  setExpandedId(open ? null : ex.session_exercise_id)
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-text-primary">{ex.exercise.name}</p>
                  <p className="mt-0.5 text-sm text-text-muted">
                    {ex.target_sets} sets · {formatRepRange(ex.rep_min, ex.rep_max)} · Rest{" "}
                    {formatRest(ex.rest_seconds)}
                    {loggedSets > 0 ? (
                      <span className="text-[color:var(--color-recovery)]">
                        {" "}
                        · {loggedSets}/{ex.target_sets} logged
                      </span>
                    ) : null}
                  </p>
                </div>
                <span className="text-text-muted">{open ? "−" : "+"}</span>
              </button>

              {open ? (
                <div>
                  <CoachPrescriptionBadge rx={coachRx} />

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-xs"
                      disabled={busy || index === 0}
                      onClick={() => void moveExercise(index, -1)}
                    >
                      Move up
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-xs"
                      disabled={busy || index === workout.exercises.length - 1}
                      onClick={() => void moveExercise(index, 1)}
                    >
                      Move down
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-xs"
                      disabled={busy}
                      onClick={() => {
                        setReplaceTarget(ex);
                        void searchExercises("");
                      }}
                    >
                      Replace
                    </Button>
                  </div>

                  <SetLogger
                    key={`${ex.session_exercise_id}-${ex.sets.length}`}
                    sessionId={workout.session.id}
                    exercise={ex}
                    routineTitle={workout.session.title}
                    onSaved={onUpdate}
                    onRestStart={setRestSeconds}
                  />
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" onClick={() => void finishWorkout()} disabled={busy}>
          Finish workout
        </Button>
        <Button variant="danger" onClick={() => void cancelWorkout()} disabled={busy}>
          Discard
        </Button>
      </div>

      {restSeconds != null && restSeconds > 0 ? (
        <RestTimer
          seconds={restSeconds}
          onDone={() => setRestSeconds(null)}
          onSkip={() => setRestSeconds(null)}
        />
      ) : null}

      {replaceTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <Card className="max-h-[80vh] w-full max-w-md overflow-y-auto">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium text-text-primary">Replace exercise</h3>
              <button
                type="button"
                className="text-text-muted hover:text-text-primary"
                onClick={() => setReplaceTarget(null)}
              >
                ✕
              </button>
            </div>
            <Input
              placeholder="Search exercises…"
              value={searchQ}
              onChange={(e) => void searchExercises(e.target.value)}
              autoFocus
            />
            <ul className="mt-3 space-y-1">
              {searchResults.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.06)]",
                    )}
                    onClick={() => void confirmReplace(item.id)}
                  >
                    {item.name}
                    {item.equipment ? (
                      <span className="text-text-muted"> · {item.equipment}</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
