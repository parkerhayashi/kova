"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDuration, cn } from "@/lib/utils";
import { routineNameMatchesSplit } from "@/lib/coach-bridge";
import { formatRepRange, formatRest } from "@/lib/workouts";
import type { RoutineDetail, WorkoutSession } from "@/types";

export function RoutineList({
  routines,
  recentSessions,
  onStart,
  onViewSession,
  onViewExercise,
  highlightRoutineName,
}: {
  routines: RoutineDetail[];
  recentSessions: WorkoutSession[];
  onStart: (routineId: string) => void;
  onViewSession?: (sessionId: string) => void;
  onViewExercise?: (exerciseId: string) => void;
  highlightRoutineName?: string | null;
}) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {routines.map((routine) => {
          const isToday =
            highlightRoutineName != null &&
            routineNameMatchesSplit(routine.name, highlightRoutineName);
          return (
          <Card
            key={routine.id}
            className={cn(
              "flex flex-col gap-4",
              isToday && "border-[color:var(--color-recovery)]",
            )}
          >
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-text-primary">
                  {routine.name}
                </h2>
                {isToday ? (
                  <span className="rounded-full bg-[rgba(255,255,255,0.08)] px-2 py-0.5 text-xs text-[color:var(--color-recovery)]">
                    Today
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                {routine.exercises.length} exercises · {routine.total_sets} sets · ~
                {routine.estimated_minutes}m
              </p>
            </div>

            <ul className="space-y-2 border-t border-border pt-3">
              {routine.exercises.map((ex) => (
                <li key={ex.id} className="text-sm">
                  {onViewExercise ? (
                    <button
                      type="button"
                      className="text-left text-text-primary hover:underline"
                      onClick={() => onViewExercise(ex.exercise.id)}
                    >
                      {ex.exercise.name}
                    </button>
                  ) : (
                    <span className="text-text-primary">{ex.exercise.name}</span>
                  )}
                  <span className="text-text-muted">
                    {" "}
                    · {ex.target_sets} sets · {formatRepRange(ex.rep_min, ex.rep_max)} ·{" "}
                    {formatRest(ex.rest_seconds)}
                  </span>
                  {ex.notes ? (
                    <span className="block text-xs text-text-muted">{ex.notes}</span>
                  ) : null}
                </li>
              ))}
            </ul>

            <Button className="mt-auto w-full" onClick={() => onStart(routine.id)}>
              Start {routine.name}
            </Button>
          </Card>
          );
        })}
      </section>

      {recentSessions.length > 0 ? (
        <section>
          <h3 className="metric-label mb-3">Recent sessions</h3>
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <Card
                key={session.id}
                className={`flex items-center justify-between py-3 ${onViewSession ? "cursor-pointer card-interactive" : ""}`}
                onClick={
                  onViewSession ? () => onViewSession(session.id) : undefined
                }
                role={onViewSession ? "button" : undefined}
                tabIndex={onViewSession ? 0 : undefined}
                onKeyDown={
                  onViewSession
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          onViewSession(session.id);
                        }
                      }
                    : undefined
                }
              >
                <div>
                  <p className="text-sm font-medium text-text-primary">
                    {session.title ?? "Workout"}
                  </p>
                  <p className="text-xs text-text-muted">{session.date}</p>
                </div>
                <p className="text-sm tabular-nums text-[color:var(--color-activity)]">
                  {formatDuration(session.duration)}
                </p>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
