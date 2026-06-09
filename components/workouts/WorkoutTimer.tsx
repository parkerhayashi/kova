"use client";

import { useEffect, useState } from "react";
import { formatDuration as formatTimer } from "@/lib/workouts";

export function WorkoutTimer({ startedAt }: { startedAt: string | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    function tick() {
      setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  return (
    <span className="font-mono text-sm tabular-nums text-[color:var(--color-activity)]">
      {formatTimer(elapsed)}
    </span>
  );
}
