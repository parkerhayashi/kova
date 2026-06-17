import { Card } from "@/components/ui/Card";
import { hevyVolumeLbs } from "@/lib/hevy";
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

export function HevyHistory({
  workouts,
  timezone,
}: {
  workouts: Workout[];
  timezone: string;
}) {
  if (workouts.length === 0) return null;

  return (
    <section>
      <h3 className="metric-label mb-3">Hevy history</h3>
      <div className="space-y-2">
        {workouts.map((workout) => {
          const volumeLbs = hevyVolumeLbs(workout.volume_kg);
          const exerciseCount = workout.exercises?.length ?? 0;
          return (
            <Card key={workout.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {workout.title ?? "Workout"}
                </p>
                <p className="text-text-muted text-xs">
                  {workout.date ? formatDay(workout.date, timezone) : "—"}
                  {exerciseCount ? ` · ${exerciseCount} exercises` : ""}
                </p>
              </div>
              <div className="text-right text-xs text-text-secondary">
                {volumeLbs != null ? (
                  <p className="text-sm font-medium text-text-primary">
                    {volumeLbs.toLocaleString()} lb
                  </p>
                ) : null}
                {workout.duration != null ? (
                  <p className="text-text-muted">{formatDuration(workout.duration)}</p>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
