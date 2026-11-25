/**
 * Performance engine — pure (client-safe). Training load → fitness / fatigue /
 * form, Strain and Recovery scores, race predictions and pace zones.
 *
 * Load is Garmin's per-activity training load (≈ EPOC). Sessions Garmin didn't
 * record (manual runs, Hevy lifts without the watch) get a duration-based
 * estimate so the curves don't drop out on those days.
 */
import { addDays, daysBetween } from "@/lib/utils";

export type Sport = "run" | "ride" | "lift";

export type LoadSession = {
  date: string;
  sport: Sport;
  duration_min: number;
  /** Garmin's training load; null → estimated from duration. */
  load: number | null;
  /** Harder sessions estimate higher (tempo / intervals / race). */
  hard?: boolean;
};

/** Load per minute when Garmin didn't measure the session. */
const EST_LOAD_PER_MIN: Record<Sport, { easy: number; hard: number }> = {
  run: { easy: 1.4, hard: 2.2 },
  ride: { easy: 1.1, hard: 1.8 },
  lift: { easy: 0.8, hard: 0.8 },
};

export function sessionLoad(s: LoadSession): { load: number; estimated: boolean } {
  if (s.load != null && s.load > 0) return { load: s.load, estimated: false };
  const rate = EST_LOAD_PER_MIN[s.sport][s.hard ? "hard" : "easy"];
  return { load: Math.round(s.duration_min * rate), estimated: true };
}

export type DayLoad = { date: string; total: number; run: number; ride: number; lift: number; estimated: boolean };

/** Load per day over [start, end] (days without training are 0). */
export function dailyLoads(sessions: LoadSession[], start: string, end: string): DayLoad[] {
  const byDate = new Map<string, DayLoad>();
  for (let d = start; d <= end; d = addDays(d, 1)) {
    byDate.set(d, { date: d, total: 0, run: 0, ride: 0, lift: 0, estimated: false });
  }
  for (const s of sessions) {
    const day = byDate.get(s.date);
    if (!day) continue;
    const { load, estimated } = sessionLoad(s);
    day[s.sport] += load;
    day.total += load;
    day.estimated ||= estimated;
  }
  return [...byDate.values()];
}

/** Time constants (days) — the standard fitness / fatigue model. */
export const FITNESS_DAYS = 42;
export const FATIGUE_DAYS = 7;

export type FitnessPoint = {
  date: string;
  load: number;
  /** Chronic load — fitness. */
  fitness: number;
  /** Acute load — fatigue. */
  fatigue: number;
  /** Fitness − fatigue going into the day (positive = fresh). */
  form: number;
  /** Fatigue ÷ fitness; > 1.5 means ramping too fast. Null until fitness is meaningful. */
  ratio: number | null;
};

/** Exponentially weighted fitness / fatigue / form. Seed with a few weeks of history for stable values. */
export function fitnessSeries(loads: DayLoad[]): FitnessPoint[] {
  let fitness = 0;
  let fatigue = 0;
  const round = (n: number) => Math.round(n * 10) / 10;
  return loads.map((d) => {
    const form = fitness - fatigue;
    fitness += (d.total - fitness) / FITNESS_DAYS;
    fatigue += (d.total - fatigue) / FATIGUE_DAYS;
    return {
      date: d.date,
      load: d.total,
      fitness: round(fitness),
      fatigue: round(fatigue),
      form: round(form),
      ratio: fitness >= 5 ? Math.round((fatigue / fitness) * 100) / 100 : null,
    };
  });
}

/** Strain 0–21 (Bevel / WHOOP-style log scale): 150 load ≈ 13, 300 ≈ 18. */
export function strainScore(load: number): number {
  return Math.round(21 * (1 - Math.exp(-Math.max(0, load) / 150)) * 10) / 10;
}

export function strainLabel(strain: number): string {
  if (strain >= 18) return "All out";
  if (strain >= 14) return "Strenuous";
  if (strain >= 10) return "Moderate";
  if (strain >= 5) return "Light";
  return "Rest";
}

// ---------------------------------------------------------------------------
// Recovery
// ---------------------------------------------------------------------------

export type RecoveryInputs = {
  hrv: number | null;
  /** Personal HRV baseline (Garmin's range midpoint, else the prior 14-night mean). */
  hrvBaseline: number | null;
  rhr: number | null;
  /** Prior 7-day resting-HR average. */
  rhrBaseline: number | null;
  sleepScore: number | null;
  /** Form going into today (fitness − fatigue). */
  form: number | null;
  injury: { points: number; reason: string | null };
};

export type RecoveryComponent = {
  key: "hrv" | "rhr" | "sleep" | "load";
  label: string;
  /** 0–100 sub-score. */
  score: number;
  weight: number;
  detail: string;
};

export type Recovery = {
  score: number | null;
  label: string;
  components: RecoveryComponent[];
  injury: { points: number; reason: string | null };
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/**
 * Recovery 0–100: weighted HRV vs. baseline (40%), resting HR vs. its 7-day
 * average (20%), sleep score (25%) and training form (15%), minus an injury
 * penalty. Missing inputs drop out and the weights re-normalize.
 */
export function recoveryScore(i: RecoveryInputs): Recovery {
  const parts: RecoveryComponent[] = [];
  if (i.hrv != null && i.hrvBaseline != null && i.hrvBaseline > 0) {
    const pct = (i.hrv / i.hrvBaseline - 1) * 100;
    parts.push({
      key: "hrv",
      label: "HRV",
      score: clamp(65 + pct * 2.5),
      weight: 0.4,
      detail: `${Math.round(i.hrv)} ms vs ${Math.round(i.hrvBaseline)} baseline (${pct >= 0 ? "+" : ""}${Math.round(pct)}%)`,
    });
  }
  if (i.rhr != null && i.rhrBaseline != null) {
    const diff = i.rhr - i.rhrBaseline;
    parts.push({
      key: "rhr",
      label: "Resting HR",
      score: clamp(75 - diff * 10),
      weight: 0.2,
      detail: `${Math.round(i.rhr)} bpm vs ${Math.round(i.rhrBaseline)} avg (${diff >= 0 ? "+" : ""}${Math.round(diff * 10) / 10})`,
    });
  }
  if (i.sleepScore != null) {
    parts.push({ key: "sleep", label: "Sleep", score: clamp(i.sleepScore), weight: 0.25, detail: `score ${Math.round(i.sleepScore)}` });
  }
  if (i.form != null) {
    parts.push({
      key: "load",
      label: "Training load",
      score: clamp(75 + i.form * 1.5),
      weight: 0.15,
      detail: `form ${i.form >= 0 ? "+" : ""}${Math.round(i.form)}`,
    });
  }
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  // Need HRV or sleep to say anything meaningful about recovery.
  if (!parts.some((p) => p.key === "hrv" || p.key === "sleep")) {
    return { score: null, label: "Not enough data", components: parts, injury: i.injury };
  }
  const raw = parts.reduce((s, p) => s + p.score * p.weight, 0) / totalWeight;
  const score = Math.round(clamp(raw - i.injury.points));
  return { score, label: recoveryLabel(score), components: parts, injury: i.injury };
}

export function recoveryLabel(score: number): string {
  if (score >= 70) return "Recovered";
  if (score >= 45) return "Moderate";
  return "Low";
}

export type TodayAdvice = { level: "go" | "easy" | "rest"; headline: string; detail: string };

/** One-line call for today from Recovery, ramp rate and injuries. */
export function todayAdvice(input: {
  recovery: number | null;
  ratio: number | null;
  worstInjury: { severity: number; lower: boolean; name: string } | null;
}): TodayAdvice {
  const inj = input.worstInjury;
  if (inj && inj.lower && inj.severity >= 4) {
    return { level: "rest", headline: "Protect the injury", detail: `${inj.name} is ${inj.severity}/10 — cross-train (bike) or rest instead of running.` };
  }
  if (input.recovery != null && input.recovery < 45) {
    return { level: "rest", headline: "Recovery is low", detail: "Make today easy or a rest day; save hard sessions for when Recovery is back above 60." };
  }
  if (input.ratio != null && input.ratio > 1.5) {
    return { level: "easy", headline: "Ramping fast", detail: "This week's load is well above your fitness — keep today easy to let it catch up." };
  }
  if (inj && inj.severity >= 1 && inj.lower) {
    return { level: "easy", headline: "Easy only", detail: `${inj.name} is ${inj.severity}/10 — easy running is fine, no speed work.` };
  }
  if (input.recovery != null && input.recovery < 70) {
    return { level: "easy", headline: "Train, but don't push", detail: "Moderate recovery — the planned session is fine at an easy-to-steady effort." };
  }
  return { level: "go", headline: "Good to train", detail: "Recovered — go ahead with the planned session, including quality work." };
}

// ---------------------------------------------------------------------------
// Race predictions & pace zones
// ---------------------------------------------------------------------------

export type Effort = { date: string; distance_km: number; time_min: number; label: string };

const RIEGEL = 1.06;

export const PREDICTION_TARGETS: { key: string; label: string; km: number }[] = [
  { key: "5k", label: "5K", km: 5 },
  { key: "10k", label: "10K", km: 10 },
  { key: "half", label: "Half marathon", km: 21.0975 },
];

/**
 * Riegel predictions from the best recent effort (the one that predicts the
 * fastest 5K). Efforts include walk breaks while you're on run/walk, so the
 * numbers reflect how you'd race today, not a continuous-running ceiling.
 */
export function predictRaces(
  efforts: Effort[],
  today: string,
  extra: { key: string; label: string; km: number }[] = [],
  windowDays = 60,
): { basis: Effort | null; predictions: { key: string; label: string; km: number; minutes: number }[] } {
  const recent = efforts.filter(
    (e) => e.distance_km >= 1.5 && e.time_min > 0 && daysBetween(today, e.date) <= windowDays,
  );
  if (recent.length === 0) return { basis: null, predictions: [] };
  const to5k = (e: Effort) => e.time_min * (5 / e.distance_km) ** RIEGEL;
  const basis = recent.reduce((best, e) => (to5k(e) < to5k(best) ? e : best));
  const predictions = [...PREDICTION_TARGETS, ...extra].map((t) => ({
    ...t,
    minutes: Math.round(basis.time_min * (t.km / basis.distance_km) ** RIEGEL * 10) / 10,
  }));
  return { basis, predictions };
}

export type PaceZone = { key: string; label: string; min_per_mile: [number, number]; use: string };

/** Pace zones from a 5K pace (min/mile), Daniels-style ratios. */
export function paceZonesFrom5k(fiveKMinutes: number): PaceZone[] {
  const p = fiveKMinutes / 3.10686;
  const z = (lo: number, hi: number): [number, number] => [Math.round(p * lo * 100) / 100, Math.round(p * hi * 100) / 100];
  return [
    { key: "easy", label: "Easy", min_per_mile: z(1.22, 1.38), use: "Most runs, long runs, recovery" },
    { key: "steady", label: "Steady", min_per_mile: z(1.12, 1.2), use: "End of long runs" },
    { key: "threshold", label: "Threshold", min_per_mile: z(1.05, 1.09), use: "Tempo / cruise intervals" },
    { key: "interval", label: "Interval", min_per_mile: z(0.98, 1.02), use: "3–5 min repeats" },
    { key: "repetition", label: "Repetition", min_per_mile: z(0.92, 0.96), use: "Short fast reps, strides" },
  ];
}

/** 26.9 → "26:54"; 75.5 → "1:15:30". */
export function formatRaceTime(minutes: number): string {
  const total = Math.round(minutes * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
