"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatRest } from "@/lib/workouts";

const ADJUST_STEP = 15;

export function RestTimer({
  initialSeconds,
  onDone,
  onSkip,
}: {
  initialSeconds: number;
  onDone: () => void;
  onSkip: () => void;
}) {
  const [remaining, setRemaining] = useState(initialSeconds);
  const [duration, setDuration] = useState(initialSeconds);

  useEffect(() => {
    if (remaining <= 0) {
      onDone();
      return;
    }
    const id = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => window.clearTimeout(id);
  }, [remaining, onDone]);

  function adjust(delta: number) {
    if (delta > 0) {
      setRemaining((r) => r + delta);
      setDuration((d) => d + delta);
    } else {
      setRemaining((r) => Math.max(0, r + delta));
    }
  }

  const pct = duration > 0 ? ((duration - remaining) / duration) * 100 : 100;

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
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => adjust(-ADJUST_STEP)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            −15s
          </button>
          <button
            type="button"
            onClick={() => adjust(ADJUST_STEP)}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
          >
            +15s
          </button>
        </div>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
          <div
            className={cn("h-full rounded-full bg-[color:var(--color-recovery)] transition-all")}
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
          />
        </div>
      </div>
    </div>
  );
}
