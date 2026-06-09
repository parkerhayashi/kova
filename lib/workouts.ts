/** Client-safe workout helpers (no server imports). */

export function formatRepRange(repMin: number | null, repMax: number | null): string {
  if (repMin == null && repMax == null) return "—";
  if (repMin != null && repMax != null && repMin !== repMax) {
    return `${repMin}-${repMax} reps`;
  }
  const n = repMax ?? repMin ?? 0;
  return `${n} rep${n === 1 ? "" : "s"}`;
}

export function formatRest(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m <= 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Epley estimated 1RM. */
export function estimate1RM(weightLbs: number, reps: number): number {
  if (reps < 2) return weightLbs;
  return Math.round(weightLbs * (1 + reps / 30) * 10) / 10;
}

export function setVolume(weightLbs: number | null, reps: number | null): number {
  if (weightLbs == null || reps == null) return 0;
  return weightLbs * reps;
}

export type SetRow = {
  weight_lbs: number | null;
  reps: number | null;
  completed?: boolean;
};

export function sessionVolumeLbs(
  exercises: { sets: SetRow[] }[],
): number {
  let total = 0;
  for (const ex of exercises) {
    for (const set of ex.sets) {
      if (set.completed !== false) {
        total += setVolume(set.weight_lbs, set.reps);
      }
    }
  }
  return Math.round(total);
}

export function estimateRoutineMinutes(
  exerciseCount: number,
  totalSets: number,
  avgRestSeconds = 180,
): number {
  // ~45s work per set + rest between sets + 2min transition per exercise
  const workSeconds = totalSets * 45;
  const restSeconds = Math.max(0, totalSets - 1) * avgRestSeconds;
  const transitionSeconds = exerciseCount * 120;
  return Math.round((workSeconds + restSeconds + transitionSeconds) / 60);
}
