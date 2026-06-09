"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getSuggestedWeight } from "@/lib/coach-bridge";
import { formatRepRange } from "@/lib/workouts";
import type { SessionExerciseView, WorkoutSet } from "@/types";

function emptySet(index: number): Partial<WorkoutSet> {
  return { set_index: index, weight_lbs: null, reps: null, completed: false };
}

export function SetLogger({
  sessionId,
  exercise,
  routineTitle,
  onSaved,
  onRestStart,
}: {
  sessionId: string;
  exercise: SessionExerciseView;
  routineTitle: string | null;
  onSaved: (workout: import("@/types").ActiveWorkoutView) => void;
  onRestStart: (seconds: number) => void;
}) {
  const suggested = getSuggestedWeight(exercise, routineTitle);
  const targetCount = Math.max(exercise.target_sets, exercise.sets.length || exercise.target_sets);
  const rows: Partial<WorkoutSet>[] = [];
  for (let i = 0; i < targetCount; i++) {
    rows.push(exercise.sets.find((s) => s.set_index === i) ?? emptySet(i));
  }

  const [draft, setDraft] = useState<Record<number, { weight: string; reps: string }>>(() => {
    const init: Record<number, { weight: string; reps: string }> = {};
    for (const row of rows) {
      const idx = row.set_index ?? 0;
      init[idx] = {
        weight:
          row.weight_lbs != null
            ? String(row.weight_lbs)
            : suggested != null && idx === 0
              ? String(suggested)
              : "",
        reps: row.reps != null ? String(row.reps) : "",
      };
    }
    return init;
  });
  const [saving, setSaving] = useState<number | null>(null);
  const [prMessage, setPrMessage] = useState<string | null>(null);

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
      onRestStart(exercise.rest_seconds);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      {prMessage ? (
        <p className="text-xs font-medium text-[color:var(--color-recovery)]">{prMessage}</p>
      ) : null}
      <p className="text-xs text-text-muted">
        Target: {exercise.target_sets} sets · {formatRepRange(exercise.rep_min, exercise.rep_max)}
        {exercise.notes ? ` · ${exercise.notes}` : ""}
      </p>

      <div className="grid grid-cols-[2rem_1fr_1fr_4rem] gap-2 text-xs text-text-muted">
        <span>Set</span>
        <span>Weight (lb)</span>
        <span>Reps</span>
        <span />
      </div>

      {rows.map((row, i) => {
        const done = row.completed === true;
        return (
          <div
            key={i}
            className="grid grid-cols-[2rem_1fr_1fr_4rem] items-center gap-2"
          >
            <span className="text-sm text-text-secondary">{i + 1}</span>
            <Input
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
              className="py-1.5"
            />
            <Input
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
              className="py-1.5"
            />
            <Button
              type="button"
              variant={done ? "ghost" : "solid"}
              disabled={done || saving === i}
              className="px-2 py-1.5 text-xs"
              onClick={() => void saveSet(i)}
            >
              {done ? "✓" : saving === i ? "…" : "Log"}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
