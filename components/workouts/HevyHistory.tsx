"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { hevyVolumeLbs } from "@/lib/hevy";
import { hevyWeightToLbs } from "@/lib/lifting-unified";
import { formatDuration } from "@/lib/utils";
import type { Workout } from "@/types";

function formatDay(date: string, timezone: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  });
}

function formatSetLabel(
  reps: number | null,
  weightKg: number | null,
): string {
  const weightLbs = hevyWeightToLbs(weightKg);
  if (weightLbs != null && weightLbs > 0) {
    return `${Math.round(weightLbs)} lb × ${reps ?? "—"}`;
  }
  if (reps != null) return `${reps} reps`;
  return "—";
}

export function HevyHistory({
  workouts,
  timezone,
}: {
  workouts: Workout[];
  timezone: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (workouts.length === 0) return null;

  return (
    <section>
      <h3 className="metric-label mb-3">Workout history</h3>
      <div className="space-y-2">
        {workouts.map((workout) => {
          const volumeLbs = hevyVolumeLbs(workout.volume_kg);
          const exerciseCount = workout.exercises?.length ?? 0;
          const expanded = expandedId === workout.id;

          return (
            <Card key={workout.id} className="py-3">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 text-left"
                onClick={() =>
                  setExpandedId(expanded ? null : workout.id)
                }
                aria-expanded={expanded}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-text-primary">
                    {workout.title ?? "Workout"}
                  </p>
                  <p className="text-text-muted text-xs">
                    {workout.date ? formatDay(workout.date, timezone) : "—"}
                    {exerciseCount ? ` · ${exerciseCount} exercises` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-right text-xs text-text-secondary">
                  <div>
                    {volumeLbs != null ? (
                      <p className="text-sm font-medium text-text-primary">
                        {volumeLbs.toLocaleString()} lb
                      </p>
                    ) : null}
                    {workout.duration != null ? (
                      <p className="text-text-muted">
                        {formatDuration(workout.duration)}
                      </p>
                    ) : null}
                  </div>
                  <ChevronDown
                    className={`size-4 shrink-0 text-text-muted transition-transform ${
                      expanded ? "rotate-180" : ""
                    }`}
                    strokeWidth={1.5}
                  />
                </div>
              </button>

              {expanded && workout.exercises?.length ? (
                <ul className="mt-3 space-y-3 border-t border-border pt-3">
                  {workout.exercises.map((exercise) => {
                    const workingSets = (exercise.sets ?? []).filter(
                      (set) => !set.is_warmup,
                    );
                    return (
                      <li key={exercise.name}>
                        <p className="text-sm font-medium text-text-primary">
                          {exercise.name}
                        </p>
                        {workingSets.length === 0 ? (
                          <p className="text-xs text-text-muted">No sets</p>
                        ) : (
                          <ul className="mt-1 space-y-0.5 text-sm text-text-secondary">
                            {workingSets.map((set, index) => (
                              <li key={`${exercise.name}-${index}`}>
                                Set {index + 1}:{" "}
                                {formatSetLabel(set.reps, set.weight_kg)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
