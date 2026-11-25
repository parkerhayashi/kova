/**
 * Training-plan rules engine — pure (client-safe, unit-testable).
 *
 * 1. Run/walk block: the remaining sessions of the current run/walk
 *    progression, in order, on the chosen run days (the long one on the
 *    long-run day). Each becomes steps.
 * 2. Continuous phase to race day: base → build → peak → taper. Long run ramps
 *    toward ~80% of race time with a cutback every 4th week; easy runs grow;
 *    one quality session a week (strides → tempo / intervals → sustained
 *    tempo). Targets come from pace / HR zones.
 * 3. Lifts (Push / Pull / Legs) and rides on their days; legs once a week by
 *    default, never the day before a long or quality run; taper and race week
 *    lighten everything.
 */
import { addDays, daysBetween } from "@/lib/utils";
import type { PaceZone } from "@/lib/performance";
import type { PlanPhase, PlanSettings, PlanSport, PlanWorkout, RunType, WorkoutStep } from "@/types";

export type GeneratedWorkout = Omit<
  PlanWorkout,
  "id" | "plan_id" | "created_at" | "updated_at" | "planned_run_id" | "status"
>;

export type RunWalkItem = {
  run_type: Exclude<RunType, "race">;
  duration_min: number | null;
  distance_km: number | null;
  notes: string | null;
};

export type EngineInput = {
  /** First day the plan may schedule (usually tomorrow). */
  start: string;
  race: { date: string; km: number; name: string; estimate_min: number };
  settings: PlanSettings;
  runWalk: RunWalkItem[];
  paceZones: PaceZone[] | null;
  /** Garmin HR zone floors (Z1–Z5). */
  hrFloors: number[] | null;
};

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Monday = 0 … Sunday = 6. */
export function weekday(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay() + 6) % 7;
}

export const mondayOf = (iso: string) => addDays(iso, -weekday(iso));

const round5 = (n: number) => Math.max(5, Math.round(n / 5) * 5);

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

function paceRange(zones: PaceZone[] | null, key: string): string | null {
  const z = zones?.find((p) => p.key === key);
  if (!z) return null;
  const fmt = (m: number) => {
    const s = Math.round(m * 60);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  return `${fmt(z.min_per_mile[0])}–${fmt(z.min_per_mile[1])}/mi`;
}

export function targets(input: Pick<EngineInput, "paceZones" | "hrFloors">) {
  const f = input.hrFloors;
  const hr = (lo: number, hi: number | null) => (f ? `${f[lo]}${hi != null ? `–${f[hi]! - 1}` : "+"} bpm` : null);
  const join = (...parts: (string | null)[]) => parts.filter(Boolean).join(" · ") || null;
  return {
    easy: join("Easy, conversational", hr(1, 2) ? `Z2 ${hr(1, 2)}` : null),
    steady: join(paceRange(input.paceZones, "steady"), hr(2, 3) ? `Z3 ${hr(2, 3)}` : null),
    threshold: join(paceRange(input.paceZones, "threshold"), hr(3, 4) ? `Z4 ${hr(3, 4)}` : null),
    interval: join(paceRange(input.paceZones, "interval"), "hard but controlled"),
    strides: "Relaxed fast ~20 s, full walk-back recovery",
  };
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** "5 min run / 1 min walk" → { run: 5, walk: 1 }. */
export function parseRunWalk(notes: string | null): { run: number; walk: number } | null {
  const m = notes?.match(/(\d+(?:\.\d+)?)\s*min(?:utes?)?\s*run\s*\/\s*(\d+(?:\.\d+)?)\s*min(?:utes?)?\s*walk/i);
  return m ? { run: Number(m[1]), walk: Number(m[2]) } : null;
}

export function runWalkSteps(duration: number, run: number, walk: number, easy: string | null): WorkoutStep[] {
  const reps = Math.max(1, Math.round((duration - 10) / (run + walk)));
  return [
    { label: "Warm-up walk", minutes: 5 },
    {
      label: `Run ${run} / walk ${walk}`,
      repeat: reps,
      steps: [
        { label: "Run", minutes: run, target: easy },
        { label: "Walk", minutes: walk },
      ],
    },
    { label: "Cool-down walk", minutes: 5 },
  ];
}

export const easySteps = (duration: number, easy: string | null, strides = false): WorkoutStep[] => [
  { label: "Easy run", minutes: duration - (strides ? 4 : 0), target: easy },
  ...(strides ? [{ label: "Strides", repeat: 6, steps: [{ label: "Stride", minutes: 0.33, target: "relaxed fast" }, { label: "Walk back", minutes: 0.5 }] }] : []),
];

function rwItemToWorkout(item: RunWalkItem, date: string, t: ReturnType<typeof targets>): Omit<GeneratedWorkout, "week_index"> {
  const rw = parseRunWalk(item.notes);
  const easy = t.easy;
  const duration = item.duration_min ?? (item.distance_km ? Math.round(item.distance_km * 8) : 30);
  const isTest = /time trial|5k test|test/i.test(item.notes ?? "") && item.run_type === "tempo";
  if (isTest) {
    return {
      date,
      sport: "run",
      kind: "test",
      title: "5K time trial",
      phase: "run_walk",
      duration_min: 45,
      distance_km: 5,
      steps: [
        { label: "Warm-up (easy)", minutes: 10, target: t.easy },
        { label: "5K time trial — even effort, last mile hardest", minutes: null, target: "Best sustainable pace" },
        { label: "Cool-down walk", minutes: 10 },
      ],
      notes: item.notes,
    };
  }
  const kind = rw ? "run_walk" : item.run_type === "long" ? "long" : "easy";
  const steps = rw ? runWalkSteps(duration, rw.run, rw.walk, easy) : easySteps(duration, easy, /stride/i.test(item.notes ?? ""));
  // The title / duration follow the actual steps (repeats round down).
  const minutes = stepsMinutes(steps) ?? duration;
  const label = rw ? `Run/walk ${rw.run}:${rw.walk}` : item.run_type === "long" ? "Long run" : "Easy run";
  return {
    date,
    sport: "run",
    kind: item.run_type === "long" && rw ? "long_run_walk" : kind,
    title: `${item.run_type === "long" && rw ? "Long " : ""}${label} · ${minutes} min`.replace("Long Run/walk", "Long run/walk"),
    phase: "run_walk",
    duration_min: minutes,
    distance_km: item.distance_km,
    steps,
    notes: item.notes,
  };
}

// ---------------------------------------------------------------------------
// Lifts — Push / Pull / Legs
// ---------------------------------------------------------------------------

export type LiftKind = "push" | "pull" | "legs" | "full";
const QUALITY_KINDS = new Set(["tempo", "intervals", "test"]);

/** Hevy / Garmin workout title → lift kind ("Hybrid Leg Day" → legs). */
export function classifyLift(title: string | null | undefined): LiftKind | null {
  const t = (title ?? "").toLowerCase();
  if (/\bleg|lower|squat/.test(t)) return "legs";
  if (/\bpush|chest|shoulder/.test(t)) return "push";
  if (/\bpull|back|\bbi(cep)?s?\b/.test(t)) return "pull";
  if (/full|upper/.test(t)) return "full";
  return null;
}

export const liftTitle = (k: string) =>
  k === "push" ? "Push" : k === "pull" ? "Pull" : k === "legs" ? "Legs" : k === "full" ? "Full body (light)" : "Lift";

export const liftNotes = (k: string) =>
  k === "legs"
    ? "Log sets in Hevy. Placed away from your long and hard runs, so legs can go heavy."
    : k === "full"
      ? "Log sets in Hevy. Taper / race week — keep it light, no soreness."
      : "Log sets in Hevy.";

/**
 * Kinds for one week's lift slots. Legs go on the slot(s) furthest from the
 * next long / quality run (never the day before one, never the day after the
 * long run when avoidable); the rest alternate Push / Pull, continuing from
 * the last upper session. Light (taper / race) slots are full-body.
 */
export function liftKinds(input: {
  dates: string[];
  hardRunDates: Set<string>;
  legsNeeded: number;
  lastUpper: LiftKind | null;
  /** Date of the last leg session (logged or planned) — legs need 3+ days between. */
  lastLegs?: string | null;
  light?: boolean[];
}): LiftKind[] {
  const { dates, hardRunDates } = input;
  const light = input.light ?? dates.map(() => false);
  const score = (d: string) => {
    let s = 0;
    for (let n = 1; n <= 3; n++) {
      if (hardRunDates.has(addDays(d, n))) break;
      s += 1;
    }
    if (hardRunDates.has(addDays(d, -1))) s -= 2.5;
    if (hardRunDates.has(d)) s -= 0.5;
    return s;
  };
  const candidates = dates
    .map((d, i) => ({ d, i }))
    .filter(({ d, i }) => !light[i] && !hardRunDates.has(addDays(d, 1)))
    .filter(({ d }) => !input.lastLegs || d >= addDays(input.lastLegs, 3))
    .sort((a, b) => score(b.d) - score(a.d) || a.i - b.i);
  const legs = new Set<number>();
  for (const c of candidates) {
    if (legs.size >= Math.max(0, input.legsNeeded)) break;
    // Two leg days in a week still need 3+ days between them.
    if ([...legs].some((i) => Math.abs(daysBetween(dates[i]!, c.d)) < 3)) continue;
    legs.add(c.i);
  }
  let next: LiftKind = input.lastUpper === "push" ? "pull" : "push";
  return dates.map((_, i) => {
    if (light[i]) return "full";
    if (legs.has(i)) return "legs";
    const k = next;
    next = next === "push" ? "pull" : "push";
    return k;
  });
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

/** Dates in [from, to] falling on `days` (0 = Mon). */
function daysOn(from: string, to: string, days: number[]): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) if (days.includes(weekday(d))) out.push(d);
  return out;
}

/** Map a plan run kind onto run-fuel's run types (for fueling thresholds). */
export function fuelRunType(kind: string): Exclude<RunType, "race"> | "race" {
  if (kind === "race") return "race";
  if (kind.startsWith("long")) return "long";
  if (kind === "tempo" || kind === "test") return "tempo";
  if (kind === "intervals") return "intervals";
  return "easy";
}

export type PlanPreview = {
  workouts: GeneratedWorkout[];
  runWalkEnd: string | null;
  phases: { phase: PlanPhase; start: string; end: string }[];
  peakLongRunMin: number;
};

export function generatePlan(input: EngineInput): PlanPreview {
  const { settings, race } = input;
  const t = targets(input);
  const planMonday = mondayOf(input.start);
  const weekIndex = (d: string) => Math.floor(daysBetween(d, planMonday) / 7);
  const out: GeneratedWorkout[] = [];
  const push = (w: Omit<GeneratedWorkout, "week_index">) => out.push({ ...w, week_index: weekIndex(w.date) });
  const runDays = [...new Set(settings.run_days)].sort((a, b) => a - b);
  const lastDay = addDays(race.date, -1);

  // --- 1. Run/walk block -----------------------------------------------------
  // Sessions stay in their exact order (levels never go backwards). A long
  // session waits for the long-run day: earlier run days that week stay free.
  let runWalkEnd: string | null = null;
  const queue = [...input.runWalk];
  for (let date = input.start; queue.length > 0 && date <= lastDay; date = addDays(date, 1)) {
    if (!runDays.includes(weekday(date))) continue;
    const next = queue[0]!;
    const isLongDay = weekday(date) === settings.long_run_day;
    const longDayAhead = [1, 2, 3, 4, 5, 6].some(
      (n) => weekday(addDays(date, n)) === settings.long_run_day && addDays(date, n) <= lastDay,
    );
    if (next.run_type === "long" && !isLongDay && longDayAhead && runDays.includes(settings.long_run_day)) continue;
    push(rwItemToWorkout(queue.shift()!, date, t));
    runWalkEnd = date;
  }

  // --- 2. Continuous phase ----------------------------------------------------
  const contStart = runWalkEnd ? addDays(mondayOf(runWalkEnd), 7) : mondayOf(input.start);
  const raceWeek = mondayOf(race.date);
  const nWeeks = Math.max(0, Math.round(daysBetween(raceWeek, contStart) / 7)); // weeks before race week
  const taperWeeks = nWeeks >= 8 ? 2 : nWeeks >= 3 ? 1 : 0;
  const peakWeeks = Math.max(0, Math.round((nWeeks - taperWeeks) * 0.2));
  const buildWeeks = Math.max(0, Math.round((nWeeks - taperWeeks) * 0.35));
  const baseWeeks = Math.max(0, nWeeks - taperWeeks - peakWeeks - buildWeeks);
  const phaseOf = (w: number): PlanPhase =>
    w < baseWeeks ? "base" : w < baseWeeks + buildWeeks ? "build" : w < baseWeeks + buildWeeks + peakWeeks ? "peak" : "taper";

  const lastRwLong = Math.max(45, ...out.filter((w) => w.kind.startsWith("long")).map((w) => w.duration_min ?? 0));
  const peakLong = Math.min(150, Math.max(lastRwLong + 20, Math.round(race.estimate_min * 0.8)));
  const rampWeeks = Math.max(1, baseWeeks + buildWeeks);
  const qualityDay = runDays.filter((d) => d !== settings.long_run_day)[Math.floor((runDays.length - 1) / 2)] ?? null;

  const phases: PlanPreview["phases"] = [];
  if (runWalkEnd) phases.push({ phase: "run_walk", start: input.start, end: runWalkEnd });

  for (let w = 0; w < nWeeks; w++) {
    const monday = addDays(contStart, w * 7);
    const phase = phaseOf(w);
    const last = phases.at(-1);
    if (last?.phase === phase) last.end = addDays(monday, 6);
    else phases.push({ phase, start: monday, end: addDays(monday, 6) });

    const cutback = phase !== "taper" && w > 0 && (w + 1) % 4 === 0;
    const taperFactor = phase === "taper" ? (w === nWeeks - 1 ? 0.6 : 0.75) : 1;
    const ramp = Math.min(1, w / Math.max(1, rampWeeks - 1));
    let longMin = phase === "peak" ? peakLong : lastRwLong + (peakLong - lastRwLong) * ramp;
    let easyMin = 30 + 15 * ramp;
    if (cutback) {
      longMin *= 0.75;
      easyMin *= 0.85;
    }
    longMin = round5(longMin * taperFactor);
    easyMin = round5(easyMin * taperFactor);

    for (const date of daysOn(monday, addDays(monday, 6), runDays)) {
      if (date >= race.date) continue;
      const wd = weekday(date);
      if (wd === settings.long_run_day) {
        const steadyFinish = phase === "peak" && longMin >= 60;
        push({
          date,
          sport: "run",
          kind: "long",
          title: `Long run · ${longMin} min`,
          phase,
          duration_min: longMin,
          distance_km: null,
          steps: steadyFinish
            ? [
                { label: "Easy", minutes: longMin - 15, target: t.easy },
                { label: "Steady finish", minutes: 15, target: t.steady },
              ]
            : [{ label: "Long easy run", minutes: longMin, target: t.easy }],
          notes: longMin >= 75 ? "Fuel: take gels from ~45 min (Kova adds the carbs to today's target)." : null,
        });
      } else if (wd === qualityDay && !cutback) {
        push(qualitySession(date, phase, w - baseWeeks, easyMin, t));
      } else {
        push({
          date,
          sport: "run",
          kind: "easy",
          title: `Easy run · ${easyMin} min`,
          phase,
          duration_min: easyMin,
          distance_km: null,
          steps: easySteps(easyMin, t.easy, phase === "base" && wd !== qualityDay && w % 2 === 1),
          notes: null,
        });
      }
    }
  }

  // Race week: two short easy runs with strides, then race day.
  if (nWeeks >= 0 && raceWeek >= input.start) {
    phases.push({ phase: "race", start: raceWeek, end: race.date });
    for (const date of daysOn(raceWeek, addDays(race.date, -2), runDays).slice(0, 2)) {
      push({
        date,
        sport: "run",
        kind: "easy",
        title: "Shakeout · 20 min",
        phase: "race",
        duration_min: 20,
        distance_km: null,
        steps: easySteps(20, t.easy, true),
        notes: "Keep it short and easy.",
      });
    }
  }
  push({
    date: race.date,
    sport: "run",
    kind: "race",
    title: race.name,
    phase: "race",
    duration_min: Math.round(race.estimate_min),
    distance_km: race.km,
    steps: [{ label: "Race", minutes: null, target: "Start conservatively; run/walk if that's what your long runs used" }],
    notes: null,
  });

  // --- 3. Lifts (Push / Pull / Legs) & rides -----------------------------------
  const hardRunDates = new Set(
    out.filter((w) => w.sport === "run" && (w.kind.startsWith("long") || QUALITY_KINDS.has(w.kind))).map((w) => w.date),
  );
  let lastUpper: LiftKind | null = null;
  let lastLegs: string | null = null;
  const liftDates = daysOn(input.start, lastDay, settings.lift_days).filter((date) => {
    const phase = phaseFor(date, phases);
    return !(phase === "race" && weekday(date) >= weekday(race.date) - 2);
  });
  for (let i = 0; i < liftDates.length; ) {
    const week = mondayOf(liftDates[i]!);
    const dates: string[] = [];
    while (i < liftDates.length && mondayOf(liftDates[i]!) === week) dates.push(liftDates[i++]!);
    const light = dates.map((d) => {
      const phase = phaseFor(d, phases);
      return phase === "race" || phase === "taper";
    });
    const kinds = liftKinds({ dates, hardRunDates, legsNeeded: settings.legs_per_week ?? 1, lastUpper, lastLegs, light });
    dates.forEach((date, k) => {
      const kind = kinds[k]!;
      if (kind === "push" || kind === "pull") lastUpper = kind;
      if (kind === "legs") lastLegs = date;
      push({
        date,
        sport: "lift",
        kind,
        title: liftTitle(kind),
        phase: phaseFor(date, phases),
        duration_min: kind === "full" ? 35 : 50,
        distance_km: null,
        steps: null,
        notes: liftNotes(kind),
      });
    });
  }
  for (const date of daysOn(input.start, lastDay, settings.ride_days)) {
    const phase = phaseFor(date, phases);
    if (phase === "race") continue;
    const minutes = phase === "taper" ? 30 : phase === "build" || phase === "peak" ? 60 : 45;
    push({
      date,
      sport: "ride",
      kind: "endurance",
      title: `Easy ride · ${minutes} min`,
      phase,
      duration_min: minutes,
      distance_km: null,
      steps: [{ label: "Endurance ride", minutes, target: t.easy }],
      notes: "Aerobic cross-training — keep it conversational.",
    });
  }

  out.sort((a, b) => a.date.localeCompare(b.date) || sportOrder(a.sport) - sportOrder(b.sport));
  return { workouts: out, runWalkEnd, phases, peakLongRunMin: peakLong };
}

const sportOrder = (s: PlanSport) => (s === "run" ? 0 : s === "ride" ? 1 : 2);

function phaseFor(date: string, phases: PlanPreview["phases"]): PlanPhase {
  return phases.find((p) => date >= p.start && date <= p.end)?.phase ?? phases[0]?.phase ?? "base";
}

function qualitySession(
  date: string,
  phase: PlanPhase,
  buildWeek: number,
  easyMin: number,
  t: ReturnType<typeof targets>,
): Omit<GeneratedWorkout, "week_index"> {
  if (phase === "base") {
    return {
      date,
      sport: "run",
      kind: "easy",
      title: `Easy + strides · ${easyMin} min`,
      phase,
      duration_min: easyMin,
      distance_km: null,
      steps: easySteps(easyMin, t.easy, true),
      notes: null,
    };
  }
  if (phase === "taper") {
    return {
      date,
      sport: "run",
      kind: "tempo",
      title: "Tempo 2 × 8 min",
      phase,
      duration_min: 40,
      distance_km: null,
      steps: [
        { label: "Warm-up", minutes: 10, target: t.easy },
        { label: "Tempo", repeat: 2, steps: [{ label: "Threshold", minutes: 8, target: t.threshold }, { label: "Easy jog", minutes: 2 }] },
        { label: "Cool-down", minutes: 10, target: t.easy },
      ],
      notes: null,
    };
  }
  if (phase === "peak") {
    const work = 20;
    return {
      date,
      sport: "run",
      kind: "tempo",
      title: `Tempo ${work} min`,
      phase,
      duration_min: work + 20,
      distance_km: null,
      steps: [
        { label: "Warm-up", minutes: 10, target: t.easy },
        { label: "Continuous tempo", minutes: work, target: t.threshold },
        { label: "Cool-down", minutes: 10, target: t.easy },
      ],
      notes: null,
    };
  }
  // Build: alternate tempo and intervals, growing.
  if (buildWeek % 2 === 0) {
    const [reps, mins] = buildWeek < 2 ? [2, 8] : buildWeek < 4 ? [3, 8] : [3, 10];
    return {
      date,
      sport: "run",
      kind: "tempo",
      title: `Tempo ${reps} × ${mins} min`,
      phase,
      duration_min: 20 + reps * (mins + 2),
      distance_km: null,
      steps: [
        { label: "Warm-up", minutes: 10, target: t.easy },
        { label: "Tempo", repeat: reps, steps: [{ label: "Threshold", minutes: mins, target: t.threshold }, { label: "Easy jog", minutes: 2 }] },
        { label: "Cool-down", minutes: 10, target: t.easy },
      ],
      notes: null,
    };
  }
  const reps = buildWeek < 3 ? 5 : 6;
  return {
    date,
    sport: "run",
    kind: "intervals",
    title: `Intervals ${reps} × 3 min`,
    phase,
    duration_min: 20 + reps * 5,
    distance_km: null,
    steps: [
      { label: "Warm-up", minutes: 10, target: t.easy },
      { label: "Intervals", repeat: reps, steps: [{ label: "Hard", minutes: 3, target: t.interval }, { label: "Easy jog", minutes: 2 }] },
      { label: "Cool-down", minutes: 10, target: t.easy },
    ],
    notes: null,
  };
}

/** Total minutes of a step list (repeats expanded). */
export function stepsMinutes(steps: WorkoutStep[] | null): number | null {
  if (!steps) return null;
  let total = 0;
  for (const s of steps) {
    if (s.steps && s.repeat) total += (stepsMinutes(s.steps) ?? 0) * s.repeat;
    else total += s.minutes ?? 0;
  }
  return Math.round(total);
}
