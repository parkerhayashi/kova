"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatRest } from "@/lib/workouts";

export function RestTimer({
  seconds,
  onDone,
  onSkip,
}: {
  seconds: number;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [remaining, setRemaining] = useState(seconds);

  useEffect(() => {
    setRemaining(seconds);
  }, [seconds]);

  useEffect(() => {
    if (remaining <= 0) {
      onDone();
      return;
    }
    const id = window.setInterval(() => {
      setRemaining((r) => r - 1);
    }, 1000);
    return () => window.clearInterval(id);
  }, [remaining, onDone]);

  const pct = seconds > 0 ? ((seconds - remaining) / seconds) * 100 : 100;

  return (
    <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-md px-4 md:bottom-8">
      <div className="card border border-border-strong p-4 shadow-lg">
        <div className="mb-2 flex items-center justify-between">
          <span className="metric-label">Rest</span>
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-text-secondary hover:text-text-primary"
          >
            Skip
          </button>
        </div>
        <p className="metric-value text-[color:var(--color-recovery)]">
          {formatRest(Math.max(0, remaining))}
        </p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
          <div
            className={cn("h-full rounded-full bg-[color:var(--color-recovery)] transition-all")}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
