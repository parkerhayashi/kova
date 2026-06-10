"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { ExerciseSearchModal } from "@/components/workouts/ExerciseSearchModal";
import { ExerciseThumb } from "@/components/workouts/ExerciseThumb";
import { cn } from "@/lib/utils";
import { formatRepRange, formatRest } from "@/lib/workouts";
import type { RoutineDetail, RoutineExerciseView } from "@/types";

export function RoutineEditor({
  routineId,
  onClose,
  onUpdated,
}: {
  routineId: string;
  onClose: () => void;
  onUpdated?: (routine: RoutineDetail) => void;
}) {
  const [routine, setRoutine] = useState<RoutineDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<RoutineExerciseView | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/workouts/routines/${routineId}`);
    if (res.ok) {
      const data = (await res.json()) as RoutineDetail;
      setRoutine(data);
      setNameDraft(data.name);
    }
    setLoading(false);
  }, [routineId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function apiAction(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`/api/workouts/routines/${routineId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const next = json.routine as RoutineDetail;
      setRoutine(next);
      setNameDraft(next.name);
      onUpdated?.(next);
      return next;
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === routine?.name) return;
    await apiAction({ action: "update_name", name: trimmed });
  }

  async function reorderExercises(from: number, to: number) {
    if (!routine || from === to) return;
    const ordered = [...routine.exercises];
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved);
    await apiAction({
      action: "reorder",
      ordered_ids: ordered.map((e) => e.id),
    });
  }

  async function removeExercise(ex: RoutineExerciseView) {
    if (!confirm(`Remove ${ex.exercise.name} from this routine?`)) return;
    await apiAction({
      action: "remove_exercise",
      routine_exercise_id: ex.id,
    });
    setMenuOpenId(null);
  }

  async function addExercise(exerciseId: string) {
    const result = await apiAction({
      action: "add_exercise",
      exercise_id: exerciseId,
    });
    if (result) setAddExerciseOpen(false);
  }

  async function confirmReplace(exerciseId: string) {
    if (!replaceTarget) return;
    const result = await apiAction({
      action: "replace_exercise",
      routine_exercise_id: replaceTarget.id,
      exercise_id: exerciseId,
    });
    if (result) setReplaceTarget(null);
  }

  async function patchExercise(
    routineExerciseId: string,
    patch: Record<string, unknown>,
  ) {
    await apiAction({
      action: "update_exercise",
      routine_exercise_id: routineExerciseId,
      ...patch,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="border-border sticky top-0 z-10 border-b bg-background/95 px-4 py-3 backdrop-blur-sm">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <button
            type="button"
            className="text-text-muted hover:text-text-primary text-sm"
            onClick={onClose}
          >
            ← Back
          </button>
          <span className="metric-label">Edit routine</span>
          <div className="w-14" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-text-muted text-sm">Loading…</p>
        ) : routine ? (
          <div className="space-y-4">
            <Field label="Routine name">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={() => void saveName()}
                disabled={busy}
              />
            </Field>

            <p className="text-text-muted text-sm">
              {routine.exercises.length} exercises · {routine.total_sets} sets · ~
              {routine.estimated_minutes}m
            </p>

            <div className="space-y-3">
              {routine.exercises.map((ex, index) => {
                const menuOpen = menuOpenId === ex.id;
                return (
                  <Card
                    key={ex.id}
                    className={cn(
                      "wt-exercise-row p-4",
                      dragOver === index && "is-drag-over",
                    )}
                    draggable={!busy}
                    onDragStart={() => setDragFrom(index)}
                    onDragEnd={() => {
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(index);
                    }}
                    onDrop={() => {
                      if (dragFrom !== null) void reorderExercises(dragFrom, index);
                      setDragFrom(null);
                      setDragOver(null);
                    }}
                  >
                    <div className="flex items-start gap-2">
                      <span className="wt-drag mt-2" title="Drag to reorder" aria-hidden>
                        ⋮⋮
                      </span>
                      <ExerciseThumb exercise={ex.exercise} size="md" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-text-primary">
                            {ex.exercise.name}
                          </p>
                          <div className="relative">
                            <button
                              type="button"
                              aria-label="Exercise options"
                              className="rounded-lg px-2 py-1 text-text-muted hover:bg-[rgba(255,255,255,0.06)] hover:text-text-primary"
                              onClick={() => setMenuOpenId(menuOpen ? null : ex.id)}
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
                                    className="block w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-[rgba(255,255,255,0.06)]"
                                    disabled={busy}
                                    onClick={() => {
                                      setMenuOpenId(null);
                                      setReplaceTarget(ex);
                                    }}
                                  >
                                    Replace
                                  </button>
                                  <button
                                    type="button"
                                    className="block w-full px-3 py-2 text-left text-sm text-[color:var(--color-stress)] hover:bg-[rgba(255,255,255,0.06)]"
                                    disabled={busy}
                                    onClick={() => void removeExercise(ex)}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Field label="Sets">
                            <Input
                              type="number"
                              min={1}
                              defaultValue={ex.target_sets}
                              key={`sets-${ex.id}-${ex.target_sets}`}
                              disabled={busy}
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (v > 0 && v !== ex.target_sets) {
                                  void patchExercise(ex.id, { target_sets: v });
                                }
                              }}
                            />
                          </Field>
                          <Field label="Rep min">
                            <Input
                              type="number"
                              min={1}
                              defaultValue={ex.rep_min ?? ""}
                              key={`repmin-${ex.id}-${ex.rep_min}`}
                              disabled={busy}
                              onBlur={(e) => {
                                const raw = e.target.value.trim();
                                const v = raw === "" ? null : Number(raw);
                                if (v !== ex.rep_min) {
                                  void patchExercise(ex.id, { rep_min: v });
                                }
                              }}
                            />
                          </Field>
                          <Field label="Rep max">
                            <Input
                              type="number"
                              min={1}
                              defaultValue={ex.rep_max ?? ""}
                              key={`repmax-${ex.id}-${ex.rep_max}`}
                              disabled={busy}
                              onBlur={(e) => {
                                const raw = e.target.value.trim();
                                const v = raw === "" ? null : Number(raw);
                                if (v !== ex.rep_max) {
                                  void patchExercise(ex.id, { rep_max: v });
                                }
                              }}
                            />
                          </Field>
                          <Field label="Rest (sec)">
                            <Input
                              type="number"
                              min={0}
                              step={15}
                              defaultValue={ex.rest_seconds}
                              key={`rest-${ex.id}-${ex.rest_seconds}`}
                              disabled={busy}
                              onBlur={(e) => {
                                const v = Number(e.target.value);
                                if (v >= 0 && v !== ex.rest_seconds) {
                                  void patchExercise(ex.id, { rest_seconds: v });
                                }
                              }}
                            />
                          </Field>
                        </div>

                        <p className="text-text-muted mt-2 text-xs">
                          {formatRepRange(ex.rep_min, ex.rep_max)} ·{" "}
                          {formatRest(ex.rest_seconds)} rest
                        </p>

                        <textarea
                          placeholder="Notes for this exercise…"
                          rows={2}
                          defaultValue={ex.notes ?? ""}
                          key={`notes-${ex.id}-${ex.notes}`}
                          disabled={busy}
                          onBlur={(e) => {
                            const notes = e.target.value.trim() || null;
                            if (notes !== (ex.notes ?? null)) {
                              void patchExercise(ex.id, { notes });
                            }
                          }}
                          className="mt-2 w-full resize-none rounded-lg border border-transparent bg-transparent px-0 py-1 text-sm text-text-secondary placeholder:text-text-muted focus:border-border focus:bg-[rgba(255,255,255,0.02)] focus:outline-none"
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Button
              variant="solid"
              className="w-full"
              onClick={() => setAddExerciseOpen(true)}
              disabled={busy}
            >
              + Add exercise
            </Button>
          </div>
        ) : (
          <p className="text-sm text-[color:var(--color-stress)]">
            Could not load this routine.
          </p>
        )}
      </div>

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
    </div>
  );
}
