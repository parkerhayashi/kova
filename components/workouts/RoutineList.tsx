"use client";

import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { formatDuration } from "@/lib/utils";
import { formatRepRange, formatRest } from "@/lib/workouts";
import type { RoutineDetail, WorkoutSession } from "@/types";

export function RoutineList({
  routines,
  recentSessions,
  onStart,
}: {
  routines: RoutineDetail[];
  recentSessions: WorkoutSession[];
  onStart: (routineId: string) => void;
}) {
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {routines.map((routine) => (
          <Card key={routine.id} className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-text-primary">
                {routine.name}
              </h2>
              <p className="mt-1 text-sm text-text-secondary">
                {routine.exercises.length} exercises · {routine.total_sets} sets · ~
                {routine.estimated_minutes}m
              </p>
            </div>

            <ul className="space-y-2 border-t border-border pt-3">
              {routine.exercises.map((ex) => (
                <li key={ex.id} className="text-sm">
                  <span className="text-text-primary">{ex.exercise.name}</span>
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
        ))}
      </section>

      {recentSessions.length > 0 ? (
        <section>
          <h3 className="metric-label mb-3">Recent sessions</h3>
          <div className="space-y-2">
            {recentSessions.map((session) => (
              <Card key={session.id} className="flex items-center justify-between py-3">
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
