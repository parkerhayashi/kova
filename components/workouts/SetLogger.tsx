"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getSuggestedWeight } from "@/lib/coach-bridge";
import { formatPreviousSet, formatRest } from "@/lib/workouts";
import type { SessionExerciseView, WorkoutSet } from "@/types";

function emptySet(index: number): Partial<WorkoutSet> {
  return { set_index: index, weight_lbs: null, reps: null, completed: false };
}

function baseRowCount(exercise: SessionExerciseView): number {
  const fromSets =
    exercise.sets.length > 0
      ? Math.max(...exercise.sets.map((s) => s.set_index + 1))
      : 0;
  return Math.max(exercise.target_sets, fromSets, 1);
}

type PreviousByIndex = Record<number, { weight_lbs: number; reps: number }>;

export function SetLogger({
  sessionId,
  exercise,
  routineTitle,
  onSaved,
  onOpenClock,
}: {
  sessionId: string;
  exercise: SessionExerciseView;
  routineTitle: string | null;
  onSaved: (workout: import("@/types").ActiveWorkoutView) => void;
  onOpenClock: (seconds: number, autoStart: boolean) => void;
}) {
  const suggested = getSuggestedWeight(exercise, routineTitle);
  const [rowCount, setRowCount] = useState(() => baseRowCount(exercise));
  const [previousByIndex, setPreviousByIndex] = useState<PreviousByIndex>({});
  const [draft, setDraft] = useState<Record<number, { weight: string; reps: string }>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [prMessage, setPrMessage] = useState<string | null>(null);

  const rows = useMemo(() => {
    const list: Partial<WorkoutSet>[] = [];
    for (let i = 0; i < rowCount; i++) {
      list.push(exercise.sets.find((s) => s.set_index === i) ?? emptySet(i));
    }
    return list;
  }, [exercise.sets, rowCount]);

  useEffect(() => {
    setRowCount((prev) => Math.max(prev, baseRowCount(exercise)));
  }, [exercise.session_exercise_id, exercise.target_sets, exercise.sets]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(
        `/api/workouts/exercises/${exercise.exercise.id}?view=previous&exclude_session_id=${encodeURIComponent(sessionId)}`,
      );
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as { previous?: PreviousByIndex };
      if (!cancelled) setPreviousByIndex(json.previous ?? {});
    })();
    return () => {
      cancelled = true;
    };
  }, [exercise.exercise.id, exercise.session_exercise_id, sessionId]);

  useEffect(() => {
    setDraft((prev) => {
      const next = { ...prev };
      for (let i = 0; i < rowCount; i++) {
        if (next[i]) continue;
        const row = exercise.sets.find((s) => s.set_index === i);
        const prevSet = previousByIndex[i];
        const priorRow = i > 0 ? next[i - 1] : null;
        next[i] = {
          weight:
            row?.weight_lbs != null
              ? String(row.weight_lbs)
              : priorRow?.weight ||
                (prevSet ? String(prevSet.weight_lbs) : "") ||
                (suggested != null && i === 0 ? String(suggested) : ""),
          reps:
            row?.reps != null
              ? String(row.reps)
              : priorRow?.reps || (prevSet ? String(prevSet.reps) : "") || "",
        };
      }
      return next;
    });
  }, [exercise.sets, previousByIndex, rowCount, suggested]);

  async function saveSet(setIndex: number) {
    const d = draft[setIndex];
    if (!d) return;
    setSaving(setIndex);
    setPrMessage(null);
    try {
      const res = await fetch("/api/workouts/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upsert_set",
          session_id: sessionId,
          session_exercise_id: exercise.session_exercise_id,
          set_index: setIndex,
          weight_lbs: d.weight === "" ? null : Number(d.weight),
          reps: d.reps === "" ? null : Number(d.reps),
          completed: true,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.workout) onSaved(json.workout);
      if (json.pr) {
        const labels: string[] = [];
        if (json.pr.heaviest_weight) labels.push("heaviest weight");
        if (json.pr.best_est_1rm) labels.push("est. 1RM");
        if (json.pr.best_set_volume) labels.push("set volume");
        if (json.pr.rep_record) labels.push("rep record");
        if (labels.length > 0) {
          setPrMessage(`PR — ${labels.join(", ")}`);
        }
      }
      onOpenClock(exercise.rest_seconds, true);
    } finally {
      setSaving(null);
    }
  }

  function addSet() {
    const nextIndex = rowCount;
    const lastDraft = draft[nextIndex - 1];
    const prevSet = previousByIndex[nextIndex];
    setDraft((prev) => ({
      ...prev,
      [nextIndex]: {
        weight:
          lastDraft?.weight ||
          (prevSet ? String(prevSet.weight_lbs) : "") ||
          "",
        reps:
          lastDraft?.reps || (prevSet ? String(prevSet.reps) : "") || "",
      },
    }));
    setRowCount((c) => c + 1);
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {prMessage ? (
        <p className="mb-2 text-xs font-medium text-[color:var(--color-recovery)]">
          {prMessage}
        </p>
      ) : null}

      <div className="grid grid-cols-[1.75rem_minmax(0,1fr)_3.25rem_3.25rem_2.25rem] gap-x-2 gap-y-1 px-0.5">
        <span className="metric-label py-1">Set</span>
        <span className="metric-label py-1">Previous</span>
        <span className="metric-label py-1 text-center">Lbs</span>
        <span className="metric-label py-1 text-center">Reps</span>
        <span className="sr-only">Done</span>

        {rows.map((row, i) => {
          const done = row.completed === true;
          const previousLabel = formatPreviousSet(
            previousByIndex[i]?.weight_lbs,
            previousByIndex[i]?.reps,
          );

          return (
            <div key={i} className="contents">
              <span className="flex items-center text-sm tabular-nums text-text-secondary">
                {i + 1}
              </span>
              <span className="flex min-w-0 items-center truncate text-xs text-text-muted">
                {previousLabel ?? "—"}
              </span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="—"
                value={draft[i]?.weight ?? ""}
                disabled={done}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    [i]: { ...prev[i], weight: e.target.value },
                  }))
                }
                className={cn(
                  "field-input h-9 px-1 py-0 text-center text-sm tabular-nums",
                  done && "opacity-70",
                )}
              />
              <input
                type="number"
                inputMode="numeric"
                placeholder="—"
                value={draft[i]?.reps ?? ""}
                disabled={done}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    [i]: { ...prev[i], reps: e.target.value },
                  }))
                }
                className={cn(
                  "field-input h-9 px-1 py-0 text-center text-sm tabular-nums",
                  done && "opacity-70",
                )}
              />
              <button
                type="button"
                disabled={done || saving === i}
                onClick={() => void saveSet(i)}
                aria-label={done ? `Set ${i + 1} logged` : `Log set ${i + 1}`}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-colors",
                  done
                    ? "border-border-strong bg-[rgba(255,255,255,0.10)] text-text-primary"
                    : "border-border bg-[rgba(255,255,255,0.04)] text-text-muted hover:border-border-strong hover:text-text-primary",
                  saving === i && "opacity-60",
                )}
              >
                {done ? "✓" : saving === i ? "…" : ""}
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={addSet}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-[rgba(255,255,255,0.03)] py-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-border-strong hover:bg-[rgba(255,255,255,0.06)] hover:text-text-primary"
      >
        <span aria-hidden>+</span> Add Set
      </button>

      <button
        type="button"
        onClick={() => onOpenClock(exercise.rest_seconds, false)}
        className="mt-2 flex items-center gap-1.5 text-xs text-text-muted transition-colors hover:text-text-secondary"
      >
        <span className="text-[color:var(--color-activity)]">⏱</span>
        Rest timer · {formatRest(exercise.rest_seconds)}
      </button>
    </div>
  );
}
