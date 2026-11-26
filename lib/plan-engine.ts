/**
 * Training-plan rules engine — pure (client-safe, unit-testable).
 *
 * Weekly targets, not weekdays: each week gets N runs / lifts / rides and
 * scheduleWeek() gives them tentative days (re-flowed as the week goes).
 *
 * 1. Run/walk block: the remaining sessions of the current run/walk
 *    progression, in order, N per week. Each becomes steps.
 * 2. Continuous phase to race day: base → build → peak → taper. Long run ramps
 *    toward ~80% of race time with a cutback every 4th week; easy runs grow;
 *    one quality session a week (strides → tempo / intervals → sustained
 *    tempo). Targets come from pace / HR zones.
 * 3. Lifts (Push / Pull / Legs) and rides; legs once a week by default,
 *    never the day before a long or quality run; taper and race week lighten
 *    everything.
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

/**
 * Run/walk exactly as planned: "5 min run / 1 min walk" for 42 min is 7
 * rounds. Minutes that don't fill a round end as a run; "last N min
 * continuous" becomes a final continuous run. No warm-up / cool-down.
 */
export function runWalkSteps(duration: number, run: number, walk: number, easy: string | null, continuousTail = 0): WorkoutStep[] {
  const tail = Math.min(Math.max(0, continuousTail), duration);
  const body = duration - tail;
  const reps = Math.floor(body / (run + walk));
  const rem = Math.round((body - reps * (run + walk)) * 10) / 10;
  const out: WorkoutStep[] = [];
  if (reps > 0) {
    out.push({
      label: `Run ${run} / walk ${walk}`,
      repeat: reps,
      steps: [
        { label: "Run", minutes: run, target: easy },
        { label: "Walk", minutes: walk },
      ],
    });
  }
  if (rem + tail > 0) out.push({ label: tail ? "Continuous run" : "Run", minutes: rem + tail, target: easy });
  return out;
}

/** "last 10 min continuous" → 10. */
export const continuousTail = (notes: string | null) => Number(notes?.match(/last\s+(\d+)\s*min(?:utes?)?\s+continuous/i)?.[1] ?? 0);

export const easySteps = (duration: number, easy: string | null, strides = false): WorkoutStep[] => [
  { label: "Easy run", minutes: duration - (strides ? 4 : 0), target: easy },
  ...(strides ? [{ label: "Strides", repeat: 6, steps: [{ label: "Stride", minutes: 0.33, target: "relaxed fast" }, { label: "Walk back", minutes: 0.5 }] }] : []),
];

export function rwItemToWorkout(item: RunWalkItem, date: string, t: ReturnType<typeof targets>): Omit<GeneratedWorkout, "week_index"> {
  const rw = parseRunWalk(item.notes);
  const isTest = /time trial|5k test|test/i.test(item.notes ?? "") && item.run_type === "tempo";
  if (isTest) {
    return {
      date,
      sport: "run",
      kind: "test",
      title: "5K time trial",
      phase: "run_walk",
      duration_min: item.duration_min ?? 35,
      distance_km: item.distance_km ?? 5,
      steps: [{ label: "5K time trial — even effort, last mile hardest", minutes: null, target: "Best sustainable pace" }],
      notes: item.notes,
    };
  }
  // The queued minutes are the session — no rounding, no warm-up.
  const duration = item.duration_min ?? (item.distance_km ? Math.round(item.distance_km * 8) : 30);
  const long = item.run_type === "long";
  const steps = rw
    ? runWalkSteps(duration, rw.run, rw.walk, t.easy, continuousTail(item.notes))
    : easySteps(duration, t.easy, /stride/i.test(item.notes ?? ""));
  const label = rw ? `${long ? "Long run/walk" : "Run/walk"} ${rw.run}:${rw.walk}` : long ? "Long run" : "Easy run";
  return {
    date,
    sport: "run",
    kind: rw ? (long ? "long_run_walk" : "run_walk") : long ? "long" : "easy",
    title: `${label} · ${duration} min`,
    phase: "run_walk",
    duration_min: duration,
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

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

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

/** Weekly targets from settings (legacy weekday plans fall back to their day counts). */
export function planCounts(s: PlanSettings) {
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(n)));
  return {
    runs: clamp(s.runs_per_week ?? s.run_days?.length ?? 3, 1, 7),
    lifts: clamp(s.lifts_per_week ?? s.lift_days?.length ?? 0, 0, 7),
    rides: clamp(s.rides_per_week ?? s.ride_days?.length ?? 0, 0, 7),
    legs: clamp(s.legs_per_week ?? 1, 0, 2),
    /** Long runs ≥ this prefer Sat/Sun; null = any day. */
    weekendLongMin: s.long_run_weekend_min === undefined ? 60 : s.long_run_weekend_min,
  };
}

/** Every date in [from, to]. */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------------------------------------------------------------------------
// Scheduling — tentative days for a week's sessions
// ---------------------------------------------------------------------------

export type SchedItem = { id: string; sport: PlanSport; kind: string; duration_min: number | null; seq: number };
export type Booked = { date: string; sport: PlanSport; kind: string };

const isHardKind = (kind: string) => kind.startsWith("long") || QUALITY_KINDS.has(kind);

/** `n` slots out of `days`, front-loaded and evenly spread (doubles when n > days). */
function spread<T>(days: T[], n: number): T[] {
  if (n <= 0 || days.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < n; i++) out.push(days[Math.floor((i * days.length) / n) % days.length]!);
  return out;
}

/**
 * Tentative dates for one week's pending sessions. Nothing is tied to a
 * weekday: runs spread over the days left (front-loaded so falling behind is
 * hard), a run and a lift can share a day, two runs only when there are more
 * runs than days. The long run goes on a weekend when it's long enough and
 * one is left, otherwise last; quality sits away from it. Legs avoid the day
 * before / of / after a hard run and stay 3+ days from the last leg day.
 */
export function scheduleWeek(input: {
  items: SchedItem[];
  days: string[];
  booked?: Booked[];
  weekendLongMin: number | null;
  /** Days that shouldn't get a hard run (low Recovery today). */
  avoidHard?: Set<string>;
  /** Days kept empty unless that would leave sessions unplaced (rest). */
  rest?: Set<string>;
}): Map<string, string> {
  const out = new Map<string, string>();
  const booked = input.booked ?? [];
  if (input.days.length === 0) return out;
  const restFree = input.days.filter((d) => !input.rest?.has(d));
  const runs = input.items.filter((i) => i.sport === "run").sort((a, b) => a.seq - b.seq);
  const lifts = input.items.filter((i) => i.sport === "lift").sort((a, b) => a.seq - b.seq);
  const rides = input.items.filter((i) => i.sport === "ride").sort((a, b) => a.seq - b.seq);
  const pool = (n: number) => (restFree.length >= n ? restFree : input.days);

  // --- Runs ------------------------------------------------------------------
  const runFree = pool(runs.length).filter((d) => !booked.some((b) => b.sport === "run" && b.date === d));
  const runDays = spread(runFree.length >= runs.length ? runFree : pool(runs.length), runs.length).sort();
  const sequential = runs.some((r) => r.kind.includes("run_walk"));
  const assignRuns = new Map<string, string>();
  if (sequential) {
    // Run/walk levels go in order.
    runs.forEach((r, i) => assignRuns.set(r.id, runDays[i]!));
  } else {
    const slots = [...runDays];
    const take = (pick: (d: string) => boolean, prefer: "first" | "last") => {
      const idxs = slots.map((d, i) => (pick(d) ? i : -1)).filter((i) => i >= 0);
      if (!idxs.length) return null;
      const i = prefer === "first" ? idxs[0]! : idxs.at(-1)!;
      return slots.splice(i, 1)[0]!;
    };
    const long = runs.find((r) => r.kind.startsWith("long"));
    if (long) {
      const wantsWeekend = input.weekendLongMin != null && (long.duration_min ?? 0) >= input.weekendLongMin;
      const weekend = (d: string) => weekday(d) >= 5;
      let day =
        (wantsWeekend ? take(weekend, "first") : null) ?? take((d) => !input.avoidHard?.has(d), "last") ?? take(() => true, "last");
      if (wantsWeekend && day && !weekend(day)) {
        // Every slot is a weekday — move the long run onto a free weekend day.
        const sat = input.days.find((d) => weekend(d) && !runDays.includes(d) && !input.rest?.has(d));
        if (sat) day = sat;
      }
      if (day) assignRuns.set(long.id, day);
    }
    const longDay = long ? assignRuns.get(long.id) : undefined;
    for (const q of runs.filter((r) => r !== long && QUALITY_KINDS.has(r.kind))) {
      const ok = (d: string) =>
        !input.avoidHard?.has(d) &&
        (!longDay || Math.abs(daysBetween(d, longDay)) >= 2) &&
        !booked.some((b) => b.sport === "run" && isHardKind(b.kind) && Math.abs(daysBetween(d, b.date)) < 2);
      const day = take(ok, "first") ?? take((d) => !input.avoidHard?.has(d), "first") ?? take(() => true, "first");
      if (day) assignRuns.set(q.id, day);
    }
    for (const r of runs.filter((r) => !assignRuns.has(r.id))) {
      const day = take(() => true, "first") ?? input.days.at(-1)!;
      assignRuns.set(r.id, day);
    }
  }
  for (const [id, d] of assignRuns) out.set(id, d);

  // --- Lifts -----------------------------------------------------------------
  const hardOn = new Set([
    ...runs.filter((r) => isHardKind(r.kind)).map((r) => assignRuns.get(r.id)!),
    ...booked.filter((b) => b.sport === "run" && isHardKind(b.kind)).map((b) => b.date),
  ]);
  // Days without a run first; doubles (run + lift) only for what's left,
  // easy-run days before hard ones.
  const liftFree = pool(lifts.length).filter((d) => !booked.some((b) => b.sport === "lift" && b.date === d));
  const runOn = new Set([...assignRuns.values(), ...booked.filter((b) => b.sport === "run").map((b) => b.date)]);
  const solo = liftFree.filter((d) => !runOn.has(d));
  const doubles = liftFree.filter((d) => runOn.has(d)).sort((a, b) => Number(hardOn.has(a)) - Number(hardOn.has(b)) || a.localeCompare(b));
  const liftDays = (
    lifts.length <= solo.length
      ? spread(solo, lifts.length)
      : [...solo, ...spread(doubles.length ? doubles : liftFree, lifts.length - solo.length)]
  ).sort();
  const lastLegs = booked.filter((b) => b.sport === "lift" && b.kind === "legs").map((b) => b.date).sort().at(-1) ?? null;
  const legsScore = (d: string) => {
    let s = 0;
    if (hardOn.has(addDays(d, 1))) s -= 10; // never the day before a long / hard run
    if (hardOn.has(d)) s -= 3;
    if (hardOn.has(addDays(d, -1))) s -= 2;
    if (lastLegs && daysBetween(d, lastLegs) < 3) s -= 6;
    for (let n = 2; n <= 3; n++) if (!hardOn.has(addDays(d, n))) s += 0.5;
    return s;
  };
  const freeLiftDays = [...liftDays];
  for (const l of lifts.filter((l) => l.kind === "legs")) {
    const best = freeLiftDays
      .map((d, i) => ({ d, i, s: legsScore(d) }))
      .sort((a, b) => b.s - a.s || a.i - b.i)[0];
    if (!best) break;
    freeLiftDays.splice(best.i, 1);
    out.set(l.id, best.d);
  }
  // Push / pull alternate, starting opposite the last upper session.
  const lastUpper = booked
    .filter((b) => b.sport === "lift" && (b.kind === "push" || b.kind === "pull"))
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1)?.kind;
  const uppers = lifts.filter((l) => l.kind !== "legs");
  const ordered: SchedItem[] = [];
  let want = lastUpper === "push" ? "pull" : "push";
  while (uppers.length) {
    const i = uppers.findIndex((u) => u.kind === want);
    ordered.push(uppers.splice(i >= 0 ? i : 0, 1)[0]!);
    want = want === "push" ? "pull" : "push";
  }
  ordered.forEach((l, i) => out.set(l.id, freeLiftDays[i] ?? liftDays.at(-1) ?? input.days[0]!));

  // --- Rides: the least busy days, never the day before a hard run ----------
  const busy = (d: string) => [...out.values()].filter((x) => x === d).length + booked.filter((b) => b.date === d).length;
  for (const r of rides) {
    const day = [...pool(rides.length)]
      .sort((a, b) => Number(hardOn.has(addDays(a, 1))) - Number(hardOn.has(addDays(b, 1))) || busy(a) - busy(b) || a.localeCompare(b))[0];
    if (day) out.set(r.id, day);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function generatePlan(input: EngineInput): PlanPreview {
  const { settings, race } = input;
  const t = targets(input);
  const c = planCounts(settings);
  const planMonday = mondayOf(input.start);
  const raceWeek = mondayOf(race.date);
  const lastDay = addDays(race.date, -1);

  type Draft = Omit<GeneratedWorkout, "date" | "week_index"> & { week: string };
  const drafts: Draft[] = [];
  const weeks: string[] = [];
  for (let m = planMonday; m <= raceWeek; m = addDays(m, 7)) weeks.push(m);
  const daysIn = (m: string, endOffset = 0) =>
    dayRange(m < input.start ? input.start : m, [addDays(m, 6), addDays(race.date, -1 - endOffset)].sort()[0]!);
  /** Targets scale down for a partial first week. */
  const scaled = (n: number, m: string) => Math.min(n, Math.ceil((n * daysIn(m).length) / 7));

  // --- 1. Run/walk block: the queue in order, `runs` a week ------------------
  const queue = [...input.runWalk];
  let rwWeeks = 0;
  for (const m of weeks) {
    if (!queue.length || m === raceWeek) break;
    for (const item of queue.splice(0, scaled(c.runs, m))) {
      const { date: _d, ...w } = rwItemToWorkout(item, m, t);
      void _d;
      drafts.push({ ...w, week: m });
    }
    rwWeeks++;
  }

  // --- 2. Continuous phase ----------------------------------------------------
  const contWeeks = weeks.slice(rwWeeks).filter((m) => m !== raceWeek);
  const nWeeks = contWeeks.length;
  const taperWeeks = nWeeks >= 8 ? 2 : nWeeks >= 3 ? 1 : 0;
  const peakWeeks = Math.max(0, Math.round((nWeeks - taperWeeks) * 0.2));
  const buildWeeks = Math.max(0, Math.round((nWeeks - taperWeeks) * 0.35));
  const baseWeeks = Math.max(0, nWeeks - taperWeeks - peakWeeks - buildWeeks);
  const phaseOf = (w: number): PlanPhase =>
    w < baseWeeks ? "base" : w < baseWeeks + buildWeeks ? "build" : w < baseWeeks + buildWeeks + peakWeeks ? "peak" : "taper";
  const lastRwLong = Math.max(45, ...drafts.filter((w) => w.kind.startsWith("long")).map((w) => w.duration_min ?? 0));
  const peakLong = Math.min(150, Math.max(lastRwLong + 20, Math.round(race.estimate_min * 0.8)));
  const rampWeeks = Math.max(1, baseWeeks + buildWeeks);

  const phases: PlanPreview["phases"] = [];
  if (rwWeeks) phases.push({ phase: "run_walk", start: input.start, end: addDays(weeks[rwWeeks - 1]!, 6) });
  contWeeks.forEach((monday, w) => {
    const phase = phaseOf(w);
    const last = phases.at(-1);
    if (last?.phase === phase) last.end = addDays(monday, 6);
    else phases.push({ phase, start: monday < input.start ? input.start : monday, end: addDays(monday, 6) });

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
    const n = scaled(c.runs, monday);
    const steadyFinish = phase === "peak" && longMin >= 60;
    drafts.push({
      week: monday,
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
      notes: longMin >= 75 ? "Fuel: take gels from ~45 min (Kova adds the carbs to that day's target)." : null,
    });
    for (let k = 1; k < n; k++) {
      if (k === 1 && !cutback && n >= 2) {
        const { date: _d, ...q } = qualitySession(monday, phase, w - baseWeeks, easyMin, t);
        void _d;
        drafts.push({ ...q, week: monday });
      } else {
        drafts.push({
          week: monday,
          sport: "run",
          kind: "easy",
          title: `Easy run · ${easyMin} min`,
          phase,
          duration_min: easyMin,
          distance_km: null,
          steps: easySteps(easyMin, t.easy),
          notes: null,
        });
      }
    }
  });

  // Race week: up to two short shakeouts; race day itself is fixed.
  if (raceWeek >= planMonday) {
    phases.push({ phase: "race", start: raceWeek < input.start ? input.start : raceWeek, end: race.date });
    for (let k = 0; k < Math.min(2, Math.max(1, c.runs - 1)); k++) {
      drafts.push({
        week: raceWeek,
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
  const phaseOfWeek = (m: string): PlanPhase =>
    m === raceWeek ? "race" : (phases.find((p) => addDays(m, 6) >= p.start && m <= p.end)?.phase ?? "base");

  // --- 3. Lifts (Push / Pull / Legs) & rides -----------------------------------
  let nextUpper: "push" | "pull" = "push";
  for (const m of weeks) {
    const phase = phaseOfWeek(m);
    const light = phase === "taper" || phase === "race";
    const n = phase === "race" ? Math.min(c.lifts, 2) : phase === "taper" ? Math.min(c.lifts, 3) : scaled(c.lifts, m);
    const legs = light || n < 2 ? 0 : Math.min(c.legs, n - 1);
    for (let k = 0; k < n; k++) {
      const kind: LiftKind = light || n === 1 ? "full" : k < legs ? "legs" : nextUpper;
      if (kind === "push" || kind === "pull") nextUpper = kind === "push" ? "pull" : "push";
      drafts.push({
        week: m,
        sport: "lift",
        kind,
        title: liftTitle(kind),
        phase,
        duration_min: kind === "full" ? 35 : 50,
        distance_km: null,
        steps: null,
        notes: liftNotes(kind),
      });
    }
    if (phase === "race") continue;
    const minutes = phase === "taper" ? 30 : phase === "build" || phase === "peak" ? 60 : 45;
    for (let k = 0; k < scaled(c.rides, m); k++) {
      drafts.push({
        week: m,
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
  }

  // --- 4. Tentative days ----------------------------------------------------------
  const out: GeneratedWorkout[] = [];
  const booked: Booked[] = [];
  weeks.forEach((m, wi) => {
    const items = drafts.map((d, i) => ({ d, i })).filter(({ d }) => d.week === m);
    const isRaceWeek = m === raceWeek;
    const days = daysIn(m, isRaceWeek ? 1 : 0);
    const dates = scheduleWeek({
      items: items.map(({ d, i }) => ({ id: String(i), sport: d.sport, kind: d.kind, duration_min: d.duration_min, seq: i })),
      days: days.length ? days : [m < input.start ? input.start : m],
      booked: booked.filter((b) => b.date >= addDays(m, -3)),
      weekendLongMin: c.weekendLongMin,
    });
    for (const { d, i } of items) {
      const { week: _w, ...w } = d;
      void _w;
      const date = dates.get(String(i)) ?? days[0] ?? m;
      out.push({ ...w, date, week_index: wi });
      booked.push({ date, sport: w.sport, kind: w.kind });
    }
  });
  out.push({
    date: race.date,
    week_index: weeks.length - 1,
    sport: "run",
    kind: "race",
    title: race.name,
    phase: "race",
    duration_min: Math.round(race.estimate_min),
    distance_km: race.km,
    steps: [{ label: "Race", minutes: null, target: "Start conservatively; run/walk if that's what your long runs used" }],
    notes: null,
  });
  void lastDay;

  out.sort((a, b) => a.date.localeCompare(b.date) || sportOrder(a.sport) - sportOrder(b.sport));
  const rwDates = out.filter((w) => w.phase === "run_walk").map((w) => w.date).sort();
  return { workouts: out, runWalkEnd: rwDates.at(-1) ?? null, phases, peakLongRunMin: peakLong };
}

const sportOrder = (s: PlanSport) => (s === "run" ? 0 : s === "ride" ? 1 : 2);

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
      duration_min: 20,
      distance_km: null,
      steps: [{ label: "Tempo", repeat: 2, steps: [{ label: "Threshold", minutes: 8, target: t.threshold }, { label: "Easy jog", minutes: 2 }] }],
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
      duration_min: work,
      distance_km: null,
      steps: [{ label: "Continuous tempo", minutes: work, target: t.threshold }],
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
      duration_min: reps * (mins + 2),
      distance_km: null,
      steps: [{ label: "Tempo", repeat: reps, steps: [{ label: "Threshold", minutes: mins, target: t.threshold }, { label: "Easy jog", minutes: 2 }] }],
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
    duration_min: reps * 5,
    distance_km: null,
    steps: [{ label: "Intervals", repeat: reps, steps: [{ label: "Hard", minutes: 3, target: t.interval }, { label: "Easy jog", minutes: 2 }] }],
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
