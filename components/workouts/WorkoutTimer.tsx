"use client";

import { useEffect, useState } from "react";
import { formatDuration as formatTimer, formatRest } from "@/lib/workouts";

export function useWorkoutElapsed(startedAt: string | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const start = new Date(startedAt).getTime();
    function tick() {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return elapsed;
}

export function WorkoutTimer({
  startedAt,
  verbose = false,
  className,
}: {
  startedAt: string | null;
  verbose?: boolean;
  className?: string;
}) {
  const elapsed = useWorkoutElapsed(startedAt);
  const label = verbose ? formatRest(elapsed) : formatTimer(elapsed);

  return (
    <span
      className={
        className ??
        "font-mono text-sm tabular-nums text-[color:var(--color-activity)]"
      }
    >
      {label}
    </span>
  );
}
