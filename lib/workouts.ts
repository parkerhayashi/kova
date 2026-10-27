/** Client-safe lifting helpers (no server imports). */

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

export type WorkingSet = {
  weight_lbs: number | null;
  reps: number | null;
  is_warmup?: boolean;
  completed?: boolean;
  session_id?: string;
  date?: string;
};
