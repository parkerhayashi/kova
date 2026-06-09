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

export type WorkingSet = {
  weight_lbs: number | null;
  reps: number | null;
  is_warmup?: boolean;
  completed?: boolean;
  session_id?: string;
  date?: string;
};

export type RepRecord = {
  reps: number;
  weight_lbs: number;
  date: string;
  session_id: string;
};

export type ComputedExerciseStats = {
  heaviest_weight_lbs: number | null;
  best_est_1rm_lbs: number | null;
  best_set_volume_lbs: number | null;
  best_session_volume_lbs: number | null;
  rep_records: RepRecord[];
  total_sets: number;
  total_sessions: number;
  last_performed: string | null;
};

export type SetPRFlags = {
  heaviest_weight: boolean;
  best_est_1rm: boolean;
  best_set_volume: boolean;
  rep_record: boolean;
};

/** Aggregate PRs from working sets (non-warmup, completed). */
export function computeExerciseStats(sets: WorkingSet[]): ComputedExerciseStats {
  const working = sets.filter(
    (s) =>
      s.completed !== false &&
      !s.is_warmup &&
      s.weight_lbs != null &&
      s.reps != null &&
      s.reps > 0 &&
      s.weight_lbs > 0,
  );

  let heaviest = 0;
  let best1rm = 0;
  let bestSetVol = 0;
  const bySession = new Map<string, number>();
  const bestByRep = new Map<number, { weight: number; date: string; session_id: string }>();
  const sessionIds = new Set<string>();
  let lastDate: string | null = null;

  for (const set of working) {
    const w = set.weight_lbs!;
    const r = set.reps!;
    const vol = w * r;
    const est = estimate1RM(w, r);

    if (w > heaviest) heaviest = w;
    if (est > best1rm) best1rm = est;
    if (vol > bestSetVol) bestSetVol = vol;

    if (set.session_id) {
      sessionIds.add(set.session_id);
      bySession.set(set.session_id, (bySession.get(set.session_id) ?? 0) + vol);
    }

    const prev = bestByRep.get(r);
    if (!prev || w > prev.weight) {
      bestByRep.set(r, {
        weight: w,
        date: set.date ?? "",
        session_id: set.session_id ?? "",
      });
    }

    if (set.date && (!lastDate || set.date > lastDate)) {
      lastDate = set.date;
    }
  }

  const rep_records: RepRecord[] = [...bestByRep.entries()]
    .map(([reps, row]) => ({
      reps,
      weight_lbs: row.weight,
      date: row.date,
      session_id: row.session_id,
    }))
    .sort((a, b) => a.reps - b.reps);

  let bestSessionVol = 0;
  for (const vol of bySession.values()) {
    if (vol > bestSessionVol) bestSessionVol = vol;
  }

  return {
    heaviest_weight_lbs: heaviest > 0 ? heaviest : null,
    best_est_1rm_lbs: best1rm > 0 ? best1rm : null,
    best_set_volume_lbs: bestSetVol > 0 ? Math.round(bestSetVol) : null,
    best_session_volume_lbs: bestSessionVol > 0 ? Math.round(bestSessionVol) : null,
    rep_records,
    total_sets: working.length,
    total_sessions: sessionIds.size,
    last_performed: lastDate,
  };
}

/** Check whether a logged set beats existing PRs. */
export function checkSetPRs(
  prior: ComputedExerciseStats,
  weightLbs: number,
  reps: number,
): SetPRFlags {
  const est = estimate1RM(weightLbs, reps);
  const vol = weightLbs * reps;
  const repBest = prior.rep_records.find((r) => r.reps === reps)?.weight_lbs ?? 0;

  return {
    heaviest_weight: prior.heaviest_weight_lbs == null || weightLbs > prior.heaviest_weight_lbs,
    best_est_1rm: prior.best_est_1rm_lbs == null || est > prior.best_est_1rm_lbs,
    best_set_volume: prior.best_set_volume_lbs == null || vol > prior.best_set_volume_lbs,
    rep_record: weightLbs > repBest,
  };
}
