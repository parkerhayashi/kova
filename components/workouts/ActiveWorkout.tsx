"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { CoachPrescriptionBadge } from "@/components/workouts/CoachPrescriptionBadge";
import { ExerciseSearchModal } from "@/components/workouts/ExerciseSearchModal";
import { ExerciseThumb } from "@/components/workouts/ExerciseThumb";
import { MuscleMapBadge } from "@/components/workouts/MuscleMapBadge";
import { SetLogger } from "@/components/workouts/SetLogger";
import { WorkoutClockSheet } from "@/components/workouts/WorkoutClockSheet";
import { ExerciseDetailPanel } from "@/components/workouts/ExerciseDetailPanel";
import { useWorkoutElapsed } from "@/components/workouts/WorkoutTimer";
import {
  getPrescriptionForTrainExercise,
  syncSessionToCoach,
} from "@/lib/coach-bridge";
import { formatRest, sessionVolumeLbs } from "@/lib/workouts";
import type { ActiveWorkoutView, SessionExerciseView } from "@/types";

function countLoggedSets(exercises: SessionExerciseView[]): number {
  let n = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (set.completed) n += 1;
    }
  }
  return n;
}

type ClockState = {
  open: boolean;
  seconds: number;
  autoStart: boolean;
  mode: "timer" | "stopwatch";
};

export function ActiveWorkout({
  workout,
  onUpdate,
  onComplete,
}: {
  workout: ActiveWorkoutView;
  onUpdate: (workout: ActiveWorkoutView | null) => void;
  onComplete: () => void;
}) {
  const [clock, setClock] = useState<ClockState>({
    open: false,
    seconds: 180,
    autoStart: false,
    mode: "timer",
  });
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<SessionExerciseView | null>(null);
  const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const elapsed = useWorkoutElapsed(workout.session.started_at);
  const volume = sessionVolumeLbs(workout.exercises);
  const loggedSets = useMemo(
    () => countLoggedSets(workout.exercises),
    [workout.exercises],
  );

  function openClock(seconds: number, autoStart: boolean, mode: "timer" | "stopwatch" = "timer") {
    setClock({ open: true, seconds, autoStart, mode });
  }

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
    if (!confirm("Finish workout? Your top sets update Coach targets for next time.")) return;
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
    setMenuOpenId(null);
  }

  async function addExercise(exerciseId: string) {
    const result = await apiAction({
      action: "add_exercise",
      session_id: workout.session.id,
      exercise_id: exerciseId,
    });
    if (result && "session" in result) {
      onUpdate(result);
      setAddExerciseOpen(false);
    }
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
    }
  }

  async function saveNotes(sessionExerciseId: string, notes: string) {
    const result = await apiAction({
      action: "update_exercise",
      session_id: workout.session.id,
      session_exercise_id: sessionExerciseId,
      notes: notes.trim() || null,
    });
    if (result && "session" in result) onUpdate(result);
  }

  function noteValue(ex: SessionExerciseView): string {
    return notesDraft[ex.session_exercise_id] ?? ex.notes ?? "";
  }

  return (
    <div className="pb-32">
      <div className="sticky top-0 z-30 -mx-1 border-b border-border bg-background/95 px-1 pb-3 pt-1 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-text-primary">
              {workout.session.title ?? "Log workout"}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Open stopwatch"
              className="rounded-lg border border-border px-2.5 py-2 text-text-secondary hover:border-border-strong hover:text-text-primary"
              onClick={() => openClock(0, false, "stopwatch")}
            >
              ⏱
            </button>
            <Button
              variant="primary"
              className="px-4 py-2 text-sm"
              onClick={() => void finishWorkout()}
              disabled={busy}
            >
              Finish
            </Button>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
          <div className="grid flex-1 grid-cols-3 gap-2">
            <div>
              <p className="metric-label">Duration</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-[color:var(--color-activity)]">
                {formatRest(elapsed)}
              </p>
            </div>
            <div>
              <p className="metric-label">Volume</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-text-primary">
                {volume.toLocaleString()} lbs
              </p>
            </div>
            <div>
              <p className="metric-label">Sets</p>
              <p className="mt-0.5 font-mono text-sm tabular-nums text-text-primary">
                {loggedSets}
              </p>
            </div>
          </div>
          <MuscleMapBadge exercises={workout.exercises} />
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {workout.exercises.map((ex, index) => {
          const loggedForEx = ex.sets.filter((s) => s.completed).length;
          const coachRx = getPrescriptionForTrainExercise(ex, workout.session.title);
          const menuOpen = menuOpenId === ex.session_exercise_id;

          return (
            <Card key={ex.session_exercise_id} className="overflow-visible p-4">
              <div className="flex items-start gap-3">
                <ExerciseThumb exercise={ex.exercise} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => setDetailExerciseId(ex.exercise.id)}
                    >
                      <p className="font-semibold text-text-primary hover:underline">
                        {ex.exercise.name}
                      </p>
                    </button>
                    <div className="relative">
                      <button
                        type="button"
                        aria-label="Exercise options"
                        className="rounded-lg px-2 py-1 text-text-muted hover:bg-[rgba(255,255,255,0.06)] hover:text-text-primary"
                        onClick={() =>
                          setMenuOpenId(menuOpen ? null : ex.session_exercise_id)
                        }
                      >
                        ⋯
                      </button>
                      {menuOpen ? (
                        <>
                          <button
                            type="button"
                            className="fixed inset-0 z-10"
                            aria-label="Close menu"
                            onClick={() => setMenuOpenId(null)}
                          />
                          <div className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-xl border border-border bg-surface-raised py-1 shadow-lg">
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-40"
                              disabled={busy || index === 0}
                              onClick={() => void moveExercise(index, -1)}
                            >
                              Move up
                            </button>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-40"
                              disabled={busy || index === workout.exercises.length - 1}
                              onClick={() => void moveExercise(index, 1)}
                            >
                              Move down
                            </button>
                            <button
                              type="button"
                              className="block w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-[rgba(255,255,255,0.06)]"
                              disabled={busy}
                              onClick={() => {
                                setMenuOpenId(null);
                                setReplaceTarget(ex);
                              }}
                            >
                              Replace
                            </button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <textarea
                    placeholder="Add notes here…"
                    rows={2}
                    value={noteValue(ex)}
                    onChange={(e) =>
                      setNotesDraft((prev) => ({
                        ...prev,
                        [ex.session_exercise_id]: e.target.value,
                      }))
                    }
                    onBlur={(e) =>
                      void saveNotes(ex.session_exercise_id, e.target.value)
                    }
                    className="mt-2 w-full resize-none rounded-lg border border-transparent bg-transparent px-0 py-1 text-sm text-text-secondary placeholder:text-text-muted focus:border-border focus:bg-[rgba(255,255,255,0.02)] focus:outline-none"
                  />

                  {loggedForEx > 0 ? (
                    <p className="text-xs text-[color:var(--color-recovery)]">
                      {loggedForEx} set{loggedForEx === 1 ? "" : "s"} logged
                    </p>
                  ) : null}
                </div>
              </div>

              <CoachPrescriptionBadge rx={coachRx} />

              <SetLogger
                sessionId={workout.session.id}
                exercise={ex}
                routineTitle={workout.session.title}
                onSaved={onUpdate}
                onOpenClock={(seconds, autoStart) => openClock(seconds, autoStart)}
              />
            </Card>
          );
        })}
      </div>

      <div className="mt-4 space-y-2">
        <Button
          variant="solid"
          className="w-full"
          onClick={() => setAddExerciseOpen(true)}
          disabled={busy}
        >
          + Add Exercise
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="ghost" onClick={() => setSettingsOpen(true)} disabled={busy}>
            Settings
          </Button>
          <Button variant="danger" onClick={() => void cancelWorkout()} disabled={busy}>
            Discard workout
          </Button>
        </div>
      </div>

      <WorkoutClockSheet
        open={clock.open}
        initialMode={clock.mode}
        initialSeconds={clock.mode === "stopwatch" ? 0 : clock.seconds}
        autoStart={clock.autoStart}
        onClose={() => setClock((c) => ({ ...c, open: false }))}
        onTimerComplete={() => setClock((c) => ({ ...c, open: false }))}
      />

      {addExerciseOpen ? (
        <ExerciseSearchModal
          title="Add exercise"
          onClose={() => setAddExerciseOpen(false)}
          onSelect={addExercise}
        />
      ) : null}

      {replaceTarget ? (
        <ExerciseSearchModal
          title="Replace exercise"
          onClose={() => setReplaceTarget(null)}
          onSelect={confirmReplace}
        />
      ) : null}

      {detailExerciseId ? (
        <ExerciseDetailPanel
          exerciseId={detailExerciseId}
          onClose={() => setDetailExerciseId(null)}
        />
      ) : null}

      {settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
          <Card className="w-full max-w-md">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-medium text-text-primary">Workout settings</h3>
              <button
                type="button"
                className="text-text-muted hover:text-text-primary"
                onClick={() => setSettingsOpen(false)}
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-text-secondary">
              Rest timers use each exercise&apos;s configured rest (default 3 min). Tap
              &ldquo;Rest timer&rdquo; under an exercise to adjust before starting.
            </p>
            <p className="mt-3 text-sm text-text-muted">
              Use the header stopwatch for a free-running timer during your session.
            </p>
            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => setSettingsOpen(false)}
            >
              Done
            </Button>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
