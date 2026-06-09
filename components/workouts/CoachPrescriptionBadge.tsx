"use client";

import type { CoachPrescription } from "@/lib/coach-rx";

export function CoachPrescriptionBadge({ rx }: { rx: CoachPrescription | null }) {
  if (!rx) return null;

  const target = rx.bw
    ? `${rx.reps} reps`
    : `${rx.weight} lb × ${rx.reps}`;

  return (
    <div className="mt-2 rounded-lg border border-border bg-[rgba(255,255,255,0.03)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-[color:var(--color-recovery)]">
          Coach · {rx.tag}
        </span>
        <span className="text-sm text-text-primary">{target}</span>
      </div>
      <p className="mt-1 text-xs text-text-muted">{rx.reason}</p>
    </div>
  );
}
