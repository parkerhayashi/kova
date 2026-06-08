"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Search, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  addExerciseToSessionAction,
  addSetAction,
  createExerciseAction,
  deleteSessionAction,
  deleteSetAction,
  removeExerciseAction,
  updateSessionAction,
  updateSetAction,
} from "@/app/(dashboard)/workouts/actions";
import type { Exercise, SessionExerciseGroup, WorkoutSession } from "@/types";

interface LocalSet {
  id: string;
  weight: string;
  reps: string;
  completed: boolean;
  is_warmup: boolean;
}

interface LocalGroup {
  exerciseId: string;
  name: string;
  position: number;
  sets: LocalSet[];
}

function toLocal(groups: SessionExerciseGroup[]): LocalGroup[] {
  return groups.map((g) => ({
    exerciseId: g.exercise.id,
    name: g.exercise.name,
    position: g.position,
    sets: g.sets.map((s) => ({
      id: s.id,
      weight: s.weight_lbs?.toString() ?? "",
      reps: s.reps?.toString() ?? "",
      completed: s.completed,
      is_warmup: s.is_warmup,
    })),
  }));
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));

export function SessionEditor({
  session,
  initialGroups,
  exercises,
}: {
  session: WorkoutSession;
  initialGroups: SessionExerciseGroup[];
  exercises: Exercise[];
}) {
  const router = useRouter();
  const [groups, setGroups] = useState<LocalGroup[]>(() => toLocal(initialGroups));
  const [library, setLibrary] = useState<Exercise[]>(exercises);
  const [title, setTitle] = useState(session.title ?? "");
  const [picking, setPicking] = useState(false);
  const [, startTransition] = useTransition();

  const volume = useMemo(
    () =>
      groups.reduce(
        (total, g) =>
          total +
          g.sets.reduce((s, set) => {
            const w = num(set.weight);
            const r = num(set.reps);
            return set.is_warmup || !w || !r ? s : s + w * r;
          }, 0),
        0,
      ),
    [groups],
  );
  const workingSets = groups.reduce(
    (n, g) => n + g.sets.filter((s) => !s.is_warmup).length,
    0,
  );

  function patchSet(exerciseId: string, setId: string, patch: Partial<LocalSet>) {
    setGroups((gs) =>
      gs.map((g) =>
        g.exerciseId !== exerciseId
          ? g
          : { ...g, sets: g.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) },
      ),
    );
  }

  function commitSet(setId: string, fields: Parameters<typeof updateSetAction>[1]) {
    startTransition(async () => {
      await updateSetAction(setId, fields);
    });
  }

  function addSet(group: LocalGroup) {
    const last = group.sets[group.sets.length - 1];
    startTransition(async () => {
      const created = await addSetAction({
        session_id: session.id,
        exercise_id: group.exerciseId,
        position: group.position,
        set_index: group.sets.length,
        weight_lbs: last ? num(last.weight) : null,
        reps: last ? num(last.reps) : null,
      });
      if (!created) return;
      setGroups((gs) =>
        gs.map((g) =>
          g.exerciseId !== group.exerciseId
            ? g
            : {
                ...g,
                sets: [
                  ...g.sets,
                  {
                    id: created.id,
                    weight: created.weight_lbs?.toString() ?? "",
                    reps: created.reps?.toString() ?? "",
                    completed: created.completed,
                    is_warmup: created.is_warmup,
                  },
                ],
              },
        ),
      );
    });
  }

  function removeSet(exerciseId: string, setId: string) {
    setGroups((gs) =>
      gs
        .map((g) =>
          g.exerciseId !== exerciseId
            ? g
            : { ...g, sets: g.sets.filter((s) => s.id !== setId) },
        )
        .filter((g) => g.sets.length > 0),
    );
    startTransition(async () => {
      await deleteSetAction(setId);
    });
  }

  function removeExercise(exerciseId: string) {
    setGroups((gs) => gs.filter((g) => g.exerciseId !== exerciseId));
    startTransition(async () => {
      await removeExerciseAction(session.id, exerciseId);
    });
  }

  function addExercise(exercise: Exercise) {
    setPicking(false);
    startTransition(async () => {
      const created = await addExerciseToSessionAction(session.id, exercise.id);
      if (!created) return;
      setGroups((gs) => [
        ...gs,
        {
          exerciseId: exercise.id,
          name: exercise.name,
          position: created.position,
          sets: [
            {
              id: created.id,
              weight: "",
              reps: "",
              completed: created.completed,
              is_warmup: created.is_warmup,
            },
          ],
        },
      ]);
    });
  }

  function commitTitle() {
    if ((session.title ?? "") === title.trim()) return;
    startTransition(async () => {
      await updateSessionAction(session.id, { title: title.trim() || null });
    });
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          placeholder="Workout title (e.g. Push Day)"
          className="border-transparent bg-transparent px-0 text-lg font-medium focus:border-transparent"
        />
        <div className="flex gap-6">
          <div>
            <span className="metric-label">Volume</span>
            <p className="metric-value text-2xl" style={{ color: "var(--color-activity)" }}>
              {Math.round(volume).toLocaleString()}
              <span className="text-text-muted ml-1 text-sm font-normal">lbs</span>
            </p>
          </div>
          <div>
            <span className="metric-label">Sets</span>
            <p className="metric-value text-2xl">{workingSets}</p>
          </div>
          <div>
            <span className="metric-label">Exercises</span>
            <p className="metric-value text-2xl">{groups.length}</p>
          </div>
        </div>
      </Card>

      {groups.map((group) => (
        <Card key={group.exerciseId} className="space-y-3 p-0">
          <div className="flex items-center justify-between px-5 pt-4">
            <h3 className="text-text-primary text-sm font-medium">{group.name}</h3>
            <button
              onClick={() => removeExercise(group.exerciseId)}
              aria-label={`Remove ${group.name}`}
              className="text-text-muted hover:text-[color:var(--color-stress)]"
            >
              <Trash2 className="size-4" strokeWidth={1.5} />
            </button>
          </div>

          <div className="px-5">
            <div className="text-text-muted grid grid-cols-[2rem_1fr_1fr_2.5rem_2rem] items-center gap-2 pb-1 text-[11px] uppercase tracking-wide">
              <span>Set</span>
              <span>Lbs</span>
              <span>Reps</span>
              <span className="text-center">Done</span>
              <span />
            </div>
            <div className="divide-border divide-y">
              {group.sets.map((set, i) => (
                <div
                  key={set.id}
                  className="grid grid-cols-[2rem_1fr_1fr_2.5rem_2rem] items-center gap-2 py-2"
                >
                  <button
                    onClick={() => {
                      const next = !set.is_warmup;
                      patchSet(group.exerciseId, set.id, { is_warmup: next });
                      commitSet(set.id, { is_warmup: next });
                    }}
                    title={set.is_warmup ? "Warm-up set" : "Working set"}
                    className={cn(
                      "size-6 rounded text-xs font-medium tabular-nums",
                      set.is_warmup
                        ? "text-[color:var(--color-stress)]"
                        : "text-text-secondary",
                    )}
                  >
                    {set.is_warmup ? "W" : i + 1}
                  </button>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="any"
                    placeholder="0"
                    value={set.weight}
                    onChange={(e) =>
                      patchSet(group.exerciseId, set.id, { weight: e.target.value })
                    }
                    onBlur={() => commitSet(set.id, { weight_lbs: num(set.weight) })}
                    className="py-1.5"
                  />
                  <Input
                    type="number"
                    inputMode="numeric"
                    placeholder="0"
                    value={set.reps}
                    onChange={(e) =>
                      patchSet(group.exerciseId, set.id, { reps: e.target.value })
                    }
                    onBlur={() => commitSet(set.id, { reps: num(set.reps) })}
                    className="py-1.5"
                  />
                  <button
                    onClick={() => {
                      const next = !set.completed;
                      patchSet(group.exerciseId, set.id, { completed: next });
                      commitSet(set.id, { completed: next });
                    }}
                    aria-label="Toggle set complete"
                    className={cn(
                      "mx-auto flex size-6 items-center justify-center rounded-full border transition-colors",
                      set.completed
                        ? "border-transparent bg-[color:var(--color-activity)]"
                        : "border-border-strong",
                    )}
                  >
                    {set.completed ? (
                      <Check className="size-4 text-[#06080b]" strokeWidth={3} />
                    ) : null}
                  </button>
                  <button
                    onClick={() => removeSet(group.exerciseId, set.id)}
                    aria-label="Delete set"
                    className="text-text-muted hover:text-[color:var(--color-stress)]"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 pb-4">
            <Button variant="ghost" onClick={() => addSet(group)} className="w-full">
              <Plus className="size-4" /> Add set
            </Button>
          </div>
        </Card>
      ))}

      {picking ? (
        <ExercisePicker
          library={library}
          used={new Set(groups.map((g) => g.exerciseId))}
          onPick={addExercise}
          onCreate={(name) =>
            startTransition(async () => {
              const created = await createExerciseAction({
                name,
                category: null,
                equipment: null,
              });
              if (!created) return;
              setLibrary((lib) =>
                lib.some((e) => e.id === created.id) ? lib : [...lib, created],
              );
              addExercise(created);
            })
          }
          onClose={() => setPicking(false)}
        />
      ) : (
        <Button variant="ghost" onClick={() => setPicking(true)} className="w-full">
          <Plus className="size-4" /> Add exercise
        </Button>
      )}

      <div className="flex items-center justify-between pt-2">
        <Button
          variant="danger"
          onClick={() => {
            if (confirm("Delete this entire workout?")) {
              startTransition(async () => {
                await deleteSessionAction(session.id);
              });
            }
          }}
        >
          <Trash2 className="size-4" /> Delete
        </Button>
        <Button onClick={() => router.push("/workouts")}>Finish</Button>
      </div>
    </div>
  );
}

function ExercisePicker({
  library,
  used,
  onPick,
  onCreate,
  onClose,
}: {
  library: Exercise[];
  used: Set<string>;
  onPick: (exercise: Exercise) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const matches = library.filter((e) => e.name.toLowerCase().includes(q));
  const exactMatch = library.some((e) => e.name.toLowerCase() === q);

  return (
    <Card className="space-y-3 p-0">
      <div className="flex items-center gap-2 border-b border-[color:var(--color-border)] px-4 py-3">
        <Search className="text-text-muted size-4" strokeWidth={1.5} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or add an exercise…"
          className="text-text-primary placeholder:text-text-muted flex-1 bg-transparent text-sm focus:outline-none"
        />
        <button onClick={onClose} aria-label="Close" className="text-text-muted hover:text-text-primary">
          <X className="size-4" />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto px-2 pb-2">
        {q && !exactMatch ? (
          <button
            onClick={() => onCreate(query.trim())}
            className="text-text-primary flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-[rgba(255,255,255,0.04)]"
          >
            <Plus className="size-4 text-[color:var(--color-activity)]" />
            Create &ldquo;{query.trim()}&rdquo;
          </button>
        ) : null}
        {matches.map((e) => (
          <button
            key={e.id}
            onClick={() => onPick(e)}
            className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left hover:bg-[rgba(255,255,255,0.04)]"
          >
            <span className="text-text-secondary text-sm">{e.name}</span>
            <span className="text-text-muted text-xs">
              {used.has(e.id) ? "added" : (e.category ?? "")}
            </span>
          </button>
        ))}
        {matches.length === 0 && !q ? (
          <p className="text-text-muted px-3 py-4 text-sm">No exercises yet.</p>
        ) : null}
      </div>
    </Card>
  );
}
