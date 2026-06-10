"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const ADJUST_STEP = 15;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

type ClockMode = "timer" | "stopwatch";

export function WorkoutClockSheet({
  open,
  onClose,
  initialMode = "timer",
  initialSeconds = 180,
  autoStart = false,
  onTimerComplete,
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: ClockMode;
  initialSeconds?: number;
  autoStart?: boolean;
  onTimerComplete?: () => void;
}) {
  const [mode, setMode] = useState<ClockMode>(initialMode);
  const [duration, setDuration] = useState(initialSeconds);
  const [remaining, setRemaining] = useState(initialSeconds);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setDuration(initialSeconds);
    setRemaining(initialSeconds);
    setElapsed(0);
    setRunning(autoStart);
  }, [open, initialMode, initialSeconds, autoStart]);

  useEffect(() => {
    if (!open || !running) return;

    if (mode === "timer") {
      if (remaining <= 0) {
        setRunning(false);
        onTimerComplete?.();
        return;
      }
      const id = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
      return () => window.clearTimeout(id);
    }

    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [open, running, mode, remaining, onTimerComplete]);

  function adjustTimer(delta: number) {
    if (mode !== "timer") return;
    if (delta > 0) {
      setRemaining((r) => r + delta);
      setDuration((d) => d + delta);
    } else {
      setRemaining((r) => Math.max(0, r + delta));
    }
  }

  function toggleRunning() {
    if (mode === "timer" && remaining <= 0) {
      setRemaining(duration);
    }
    setRunning((r) => !r);
  }

  const displaySeconds = mode === "timer" ? Math.max(0, remaining) : elapsed;
  const progress =
    mode === "timer" && duration > 0
      ? ((duration - Math.max(0, remaining)) / duration) * 100
      : mode === "stopwatch"
        ? Math.min(100, (elapsed % 60) * (100 / 60))
        : 0;

  const ringRadius = 54;
  const circumference = 2 * Math.PI * ringRadius;
  const dashOffset = circumference - (progress / 100) * circumference;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Close clock"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg rounded-t-2xl border border-border bg-surface-raised px-5 pb-8 pt-4 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-text-primary">Clock</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-text-muted hover:text-text-primary"
          >
            Close
          </button>
        </div>

        <div className="mb-6 flex rounded-xl border border-border bg-[rgba(255,255,255,0.03)] p-1">
          {(["timer", "stopwatch"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setMode(tab);
                setRunning(false);
                if (tab === "timer") {
                  setRemaining(duration);
                } else {
                  setElapsed(0);
                }
              }}
              className={cn(
                "flex-1 rounded-lg py-2 text-sm font-medium capitalize transition-colors",
                mode === tab
                  ? "bg-[rgba(255,255,255,0.10)] text-text-primary"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              {tab === "timer" ? "Timer" : "Stopwatch"}
            </button>
          ))}
        </div>

        <div className="relative mx-auto mb-6 flex h-40 w-40 items-center justify-center">
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 120 120">
            <circle
              cx="60"
              cy="60"
              r={ringRadius}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="4"
            />
            <circle
              cx="60"
              cy="60"
              r={ringRadius}
              fill="none"
              stroke="var(--color-recovery)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dashoffset] duration-300"
            />
          </svg>
          <span className="font-mono text-4xl tabular-nums text-text-primary">
            {formatClock(displaySeconds)}
          </span>
        </div>

        {mode === "timer" ? (
          <div className="mb-6 flex items-center justify-center gap-6">
            <button
              type="button"
              onClick={() => adjustTimer(-ADJUST_STEP)}
              className="text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              −15s
            </button>
            <button
              type="button"
              onClick={() => adjustTimer(ADJUST_STEP)}
              className="text-sm font-medium text-text-secondary hover:text-text-primary"
            >
              +15s
            </button>
          </div>
        ) : (
          <div className="mb-6 h-6" />
        )}

        <Button variant="primary" className="w-full" onClick={toggleRunning}>
          {running ? "Pause" : mode === "timer" && remaining <= 0 ? "Reset & start" : "Start"}
        </Button>
      </div>
    </div>
  );
}
