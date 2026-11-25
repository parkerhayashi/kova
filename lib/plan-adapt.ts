/**
 * Plan adaptation — pure.
 *
 * reconcile(): follows what Parker actually did and is applied automatically
 * — off-plan runs count for the session they replaced, missed run/walk
 * sessions push the progression back, missed long / quality runs move to the
 * next free day, a cut-short run/walk repeats its level, and lifts follow the
 * Push / Pull / Legs rotation from what was logged.
 *
 * proposeChanges(): judgment calls (injury, low Recovery, ramp rate) — stored
 * as suggestions; nothing changes until one is accepted.
 */
import { addDays } from "@/lib/utils";
import {
  classifyLift,
  easySteps,
  liftKinds,
  liftNotes,
  liftTitle,
  mondayOf,
  parseRunWalk,
  runWalkSteps,
  stepsMinutes,
  weekday,
  WEEKDAYS,
  type LiftKind,
} from "@/lib/plan-engine";
import type { PlanOp, PlanSettings, PlanWorkout } from "@/types";

export type WorkoutState = "done" | "missed" | "skipped" | "today" | "upcoming";

export type AdaptWorkout = PlanWorkout & {
  state: WorkoutState;
  /** Matched activity duration (min) when done. */
  actual_min: number | null;
};

export type Proposal = { key: string; title: string; reason: string; ops: PlanOp[] };

export type AdaptInput = {
  today: string;
  workouts: AdaptWorkout[];
  recovery: number | null;
  ratio: number | null;
  /** Active lower-body injuries (current severity). */
  injuries: { id: string; name: string; severity: number; lower: boolean; rising: boolean }[];
  easyTarget: string | null;
};

const QUALITY = new Set(["tempo", "intervals", "test"]);
const isRun = (w: PlanWorkout) => w.sport === "run" && w.kind !== "race";
const weekKey = (d: string) => d.slice(0, 10);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-26" → "Thu Nov 26". */
export const dayLabel = (iso: string) => `${WEEKDAYS[weekday(iso)]} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;
const isRunWalk = (w: PlanWorkout) => w.sport === "run" && w.phase === "run_walk";
const isHard = (w: PlanWorkout) => w.sport === "run" && (w.kind.startsWith("long") || QUALITY.has(w.kind));

export function proposeChanges(input: AdaptInput): Proposal[] {
  const { today, workouts } = input;
  const out: Proposal[] = [];
  const upcoming = workouts.filter((w) => w.state === "upcoming" || w.state === "today");
  const within = (w: PlanWorkout, days: number) => w.date >= today && w.date <= addDays(today, days);
  const worstLower = input.injuries.filter((i) => i.lower).sort((a, b) => b.severity - a.severity)[0];

  // 1. Injury 4+: swap the next week's runs for easy rides.
  if (worstLower && worstLower.severity >= 4) {
    const runs = upcoming.filter((w) => isRun(w) && within(w, 7));
    if (runs.length) {
      out.push({
        key: `injury-xt:${worstLower.id}:${weekKey(today)}`,
        title: `Cross-train instead of running this week`,
        reason: `${worstLower.name} is ${worstLower.severity}/10. Swapping ${runs.length} run${runs.length === 1 ? "" : "s"} for easy rides keeps your fitness without loading it.`,
        ops: runs.map((w) => ({
          op: "update",
          id: w.id,
          changes: {
            sport: "ride",
            kind: "endurance",
            title: `Easy ride (instead of run) · ${Math.round(w.duration_min ?? 40)} min`,
            steps: [{ label: "Easy ride", minutes: Math.round(w.duration_min ?? 40), target: input.easyTarget }],
            notes: `Was: ${w.title}`,
          },
        })),
      });
    }
  } else if (worstLower && worstLower.severity >= 1) {
    // 2. Injury 1–3: no quality work, and hold run/walk levels.
    const quality = upcoming.filter((w) => QUALITY.has(w.kind) && within(w, 7));
    if (quality.length) {
      out.push({
        key: `injury-easy:${worstLower.id}:${weekKey(today)}`,
        title: "Easy running only this week",
        reason: `${worstLower.name} is ${worstLower.severity}/10 — keep runs easy until it settles.`,
        ops: quality.map((w) => ({
          op: "update",
          id: w.id,
          changes: {
            kind: "easy",
            title: `Easy run · ${Math.round(w.duration_min ?? 30)} min`,
            steps: easySteps(Math.round(w.duration_min ?? 30), input.easyTarget),
            notes: `Was: ${w.title}`,
          },
        })),
      });
    }
  }

  // 3. Run/walk progression: repeat a level when the last one didn't go well.
  const doneRw = workouts.filter((w) => w.kind.includes("run_walk") && w.state === "done").at(-1);
  const nextRw = upcoming.find((w) => w.kind.includes("run_walk"));
  if (doneRw && nextRw) {
    const last = parseRunWalk(doneRw.title.replace(/.*Run\/walk (\d+):(\d+).*/i, "$1 min run / $2 min walk"));
    const next = parseRunWalk(nextRw.title.replace(/.*Run\/walk (\d+):(\d+).*/i, "$1 min run / $2 min walk"));
    // A cut-short session is handled automatically by reconcile(); pain is a judgment call.
    const hurting = input.injuries.some((i) => i.lower && (i.rising || i.severity >= 3));
    if (last && next && next.run > last.run && hurting) {
      const minutes = Math.round(nextRw.duration_min ?? 35);
      const steps = runWalkSteps(minutes, last.run, last.walk, input.easyTarget);
      out.push({
        key: `rw-repeat:${nextRw.id}`,
        title: `Repeat ${last.run}:${last.walk} before moving to ${next.run}:${next.walk}`,
        reason: "Pain is up — hold the current level until it's pain-free.",
        ops: [
          {
            op: "update",
            id: nextRw.id,
            changes: {
              title: `${nextRw.kind.startsWith("long") ? "Long run/walk" : "Run/walk"} ${last.run}:${last.walk} · ${stepsMinutes(steps)} min`,
              steps,
              notes: `Repeating ${last.run}:${last.walk} (was ${next.run}:${next.walk}).`,
            },
          },
        ],
      });
    }
  }

  // 5. Low Recovery with a hard session today: swap with the next easy run.
  const todayHard = upcoming.find((w) => w.date === today && isRun(w) && (QUALITY.has(w.kind) || w.kind.startsWith("long")));
  if (todayHard && input.recovery != null && input.recovery < 45) {
    const swap = upcoming.find((w) => w.date > today && w.date <= addDays(today, 4) && isRun(w) && w.kind === "easy");
    out.push({
      key: `lowrec:${today}`,
      title: swap ? `Swap today's ${todayHard.title} with ${swap.date}'s easy run` : `Make today's ${todayHard.title} easy`,
      reason: `Recovery is ${input.recovery} — save the hard session for a fresher day.`,
      ops: swap
        ? [
            { op: "update", id: todayHard.id, changes: { date: swap.date } },
            { op: "update", id: swap.id, changes: { date: today } },
          ]
        : [
            {
              op: "update",
              id: todayHard.id,
              changes: {
                kind: "easy",
                title: `Easy run · ${Math.round(Math.min(todayHard.duration_min ?? 30, 40))} min`,
                duration_min: Math.round(Math.min(todayHard.duration_min ?? 30, 40)),
                steps: easySteps(Math.round(Math.min(todayHard.duration_min ?? 30, 40)), input.easyTarget),
              },
            },
          ],
    });
  }

  // 6. Ramping too fast: trim the next 3 days of running by 20%.
  if (input.ratio != null && input.ratio > 1.5) {
    const runs = upcoming.filter((w) => isRun(w) && within(w, 3) && (w.duration_min ?? 0) >= 20);
    if (runs.length) {
      out.push({
        key: `ramp:${today}`,
        title: "Trim the next few runs by 20%",
        reason: `Load ratio is ${input.ratio} (above 1.5) — fatigue is outpacing fitness, a common injury-risk pattern.`,
        ops: runs.map((w) => {
          const minutes = Math.round((w.duration_min ?? 30) * 0.8);
          return {
            op: "update",
            id: w.id,
            changes: { duration_min: minutes, title: w.title.replace(/· \d+ min/, `· ${minutes} min`) },
          };
        }),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// reconcile — automatic, follows what was actually done
// ---------------------------------------------------------------------------

export type ReconcileInput = {
  today: string;
  workouts: AdaptWorkout[];
  settings: PlanSettings;
  raceDate: string;
  /** First day of the plan — runs before it don't count for plan sessions. */
  planStart: string;
  /** Watch data is complete for days before this date (Garmin last-sync day). */
  syncedThrough: string;
  /** Logged runs no planned run matched. */
  unmatchedRuns: { id: string; date: string; minutes: number }[];
  /** Logged lifts (Hevy titles), oldest first — includes some history before the plan. */
  liftLogs: { date: string; title: string | null }[];
  easyTarget: string | null;
  /** Keys of adjustments already applied (each one-time rule fires once). */
  appliedKeys: Set<string>;
};

const confirmedMissed = (w: AdaptWorkout, input: ReconcileInput) => w.state === "missed" && w.date < input.syncedThrough;

/**
 * One pass of automatic adjustments. The caller applies them, re-matches,
 * and calls again until nothing changes (each pass sees the result of the last).
 */
export function reconcile(input: ReconcileInput): Proposal[] {
  const { today, workouts } = input;
  const live = workouts.filter((w) => w.state !== "skipped");
  const upcoming = live.filter((w) => w.state === "upcoming" || w.state === "today");
  const fresh = (p: Proposal) => !input.appliedKeys.has(p.key);

  // 1. A logged run that no plan run matched counts for the session it replaced.
  for (const r of input.unmatchedRuns) {
    if (r.date < addDays(today, -7) || r.date < input.planStart) continue;
    const key = `absorb:${r.id}`;
    if (input.appliedKeys.has(key)) continue;
    const missedRw = live.filter((w) => isRunWalk(w) && w.state === "missed" && w.date < r.date && w.date >= addDays(r.date, -4));
    const missed = live
      .filter((w) => isRun(w) && w.state === "missed" && w.date < r.date && w.date >= addDays(r.date, -3))
      .sort((a, b) => b.date.localeCompare(a.date));
    const early =
      r.date === today && !live.some((w) => isRun(w) && w.date === today)
        ? upcoming.find((w) => isRun(w) && w.date > today && w.date <= addDays(today, 2))
        : undefined;
    const target = missedRw[0] ?? missed[0] ?? early;
    if (!target) continue;
    return [
      {
        key,
        title: `${target.title} → ${r.date === today ? "today" : dayLabel(r.date)}`,
        reason: target.state === "missed"
          ? `You ran ${Math.round(r.minutes)} min on ${dayLabel(r.date)} instead of ${dayLabel(target.date)} — counted it as this session.`
          : `You ran ${Math.round(r.minutes)} min today — counted it as ${dayLabel(target.date)}'s session.`,
        ops: [{ op: "update", id: target.id, changes: { date: r.date } }],
      },
    ];
  }

  // 2. Missed run/walk session: levels go in order, so the rest of the block
  //    slides back a session. Continuous runs it now overlaps are dropped.
  const firstMissedRw = live.find((w) => isRunWalk(w) && confirmedMissed(w, input));
  if (firstMissedRw) {
    const key = `rw-shift:${firstMissedRw.id}:${firstMissedRw.date}`;
    const doneToday = live.some((w) => isRun(w) && w.date === today && w.state === "done");
    const queue = live
      .filter((w) => isRunWalk(w) && (confirmedMissed(w, input) || w.state === "upcoming" || w.state === "today"))
      .sort((a, b) => a.date.localeCompare(b.date));
    const runDays = input.settings.run_days;
    const longDay = input.settings.long_run_day;
    const lastDay = addDays(input.raceDate, -1);
    const placed: { w: AdaptWorkout; date: string }[] = [];
    let i = 0;
    for (let date = doneToday ? addDays(today, 1) : today; i < queue.length && date <= lastDay; date = addDays(date, 1)) {
      if (!runDays.includes(weekday(date))) continue;
      const next = queue[i]!;
      const longAhead = [1, 2, 3, 4, 5, 6].some((n) => weekday(addDays(date, n)) === longDay && addDays(date, n) <= lastDay);
      if (next.kind.startsWith("long") && weekday(date) !== longDay && longAhead && runDays.includes(longDay)) continue;
      placed.push({ w: next, date });
      i++;
    }
    const end = placed.at(-1)?.date ?? today;
    const moved = placed.filter((p) => p.date !== p.w.date);
    const dropped = upcoming.filter((w) => isRun(w) && !isRunWalk(w) && w.date <= end);
    if (fresh({ key, title: "", reason: "", ops: [] }) && (moved.length || dropped.length)) {
      return [
        {
          key,
          title: `Run/walk block pushed back`,
          reason: `${firstMissedRw.title} on ${dayLabel(firstMissedRw.date)} wasn't logged, so it's now on ${placed[0] ? dayLabel(placed[0].date) : "the next run day"} and the rest of the progression slides back${dropped.length ? ` (${dropped.length} continuous run${dropped.length === 1 ? "" : "s"} dropped to make room)` : ""}.`,
          ops: [
            ...moved.map((p): PlanOp => ({ op: "update", id: p.w.id, changes: { date: p.date } })),
            ...dropped.map((w): PlanOp => ({ op: "skip", id: w.id })),
          ],
        },
      ];
    }
  }

  // 3. Missed long / quality run (continuous phase): next free day in 2, else let it go.
  const runDates = new Set(live.filter(isRun).map((w) => w.date));
  const hardDates = new Set(live.filter(isHard).map((w) => w.date));
  for (const w of live.filter((w) => isHard(w) && !isRunWalk(w) && confirmedMissed(w, input) && w.date >= addDays(today, -3))) {
    const key = `missed:${w.id}`;
    if (input.appliedKeys.has(key)) continue;
    const free = [0, 1, 2]
      .map((n) => addDays(today, n))
      .find((d) => !runDates.has(d) && !hardDates.has(addDays(d, 1)) && !hardDates.has(addDays(d, -1)) && d < input.raceDate);
    if (!free) continue;
    return [
      {
        key,
        title: `${w.title} → ${free === today ? "today" : dayLabel(free)}`,
        reason: `Missed on ${dayLabel(w.date)}; ${free === today ? "today" : dayLabel(free)} has no run and isn't next to another hard day.`,
        ops: [{ op: "update", id: w.id, changes: { date: free } }],
      },
    ];
  }

  // 4. Run/walk cut short (<80% of planned): repeat that level next time.
  const lastRw = live.filter((w) => isRunWalk(w) && w.state === "done").at(-1);
  const nextRw = upcoming.find((w) => isRunWalk(w) && w.kind.includes("run_walk"));
  if (lastRw && nextRw && lastRw.actual_min != null && lastRw.duration_min != null && lastRw.actual_min < lastRw.duration_min * 0.8) {
    const key = `rw-short:${lastRw.id}`;
    const level = (w: PlanWorkout) => parseRunWalk(w.title.replace(/.*Run\/walk (\d+):(\d+).*/i, "$1 min run / $2 min walk"));
    const last = level(lastRw);
    const next = level(nextRw);
    if (!input.appliedKeys.has(key) && last && next && next.run > last.run) {
      const steps = runWalkSteps(Math.round(nextRw.duration_min ?? 35), last.run, last.walk, input.easyTarget);
      return [
        {
          key,
          title: `Repeat ${last.run}:${last.walk} next run`,
          reason: `${dayLabel(lastRw.date)}'s run/walk was ${Math.round(lastRw.actual_min)} of ${Math.round(lastRw.duration_min)} min, so ${dayLabel(nextRw.date)} repeats ${last.run}:${last.walk} before moving to ${next.run}:${next.walk}.`,
          ops: [
            {
              op: "update",
              id: nextRw.id,
              changes: {
                title: `${nextRw.kind.startsWith("long") ? "Long run/walk" : "Run/walk"} ${last.run}:${last.walk} · ${stepsMinutes(steps)} min`,
                steps,
                notes: `Repeating ${last.run}:${last.walk} (was ${next.run}:${next.walk}).`,
              },
            },
          ],
        },
      ];
    }
  }

  // 5. Lifts follow Push / Pull / Legs from what was actually logged.
  const lifts = reconcileLifts(input, live, hardDates);
  return lifts ? [lifts] : [];
}

function reconcileLifts(input: ReconcileInput, live: AdaptWorkout[], hardRunDates: Set<string>): Proposal | null {
  const { today } = input;
  const logs = input.liftLogs
    .map((l) => ({ date: l.date, kind: classifyLift(l.title) }))
    .filter((l): l is { date: string; kind: LiftKind } => l.kind != null && l.date <= today);
  const logKindOn = new Map(logs.map((l) => [l.date, l.kind]));
  const ops: PlanOp[] = [];
  const shown: string[] = [];
  const relabel = (w: PlanWorkout, kind: LiftKind) => {
    if (w.kind === kind) return;
    ops.push({
      op: "update",
      id: w.id,
      changes: { kind, title: liftTitle(kind), notes: liftNotes(kind), duration_min: kind === "full" ? 35 : 50 },
    });
    if (w.date >= today && w.date <= addDays(today, 7)) shown.push(`${dayLabel(w.date)} ${liftTitle(kind)}`);
  };

  // Done sessions take the name of what was actually logged.
  for (const w of live.filter((w) => w.sport === "lift" && w.state === "done")) {
    const k = logKindOn.get(w.date);
    if (k && k !== "full") relabel(w, k);
  }

  const legsPerWeek = input.settings.legs_per_week ?? 1;
  // The next two weeks follow reality; later weeks keep their generated order
  // until they come into range (so one change doesn't rewrite the whole plan).
  const horizon = addDays(mondayOf(today), 13);
  const slots = live.filter((w) => w.sport === "lift" && (w.state === "upcoming" || w.state === "today") && w.date <= horizon);
  let lastUpper: LiftKind | null = logs.filter((l) => l.kind === "push" || l.kind === "pull").at(-1)?.kind ?? null;
  let lastLegs: string | null = logs.filter((l) => l.kind === "legs").at(-1)?.date ?? null;
  const weeks = [...new Set(slots.map((w) => mondayOf(w.date)))].sort();
  for (const week of weeks) {
    const weekSlots = slots.filter((w) => mondayOf(w.date) === week).sort((a, b) => a.date.localeCompare(b.date));
    const legsDone = logs.filter((l) => l.kind === "legs" && mondayOf(l.date) === week).length;
    const kinds = liftKinds({
      dates: weekSlots.map((w) => w.date),
      hardRunDates,
      legsNeeded: legsPerWeek - legsDone,
      lastUpper,
      lastLegs,
      light: weekSlots.map((w) => w.phase === "taper" || w.phase === "race"),
    });
    weekSlots.forEach((w, k) => relabel(w, kinds[k]!));
    lastLegs = [...weekSlots].reverse().find((_, k) => kinds[weekSlots.length - 1 - k] === "legs")?.date ?? lastLegs;
    lastUpper = [...kinds].reverse().find((k) => k === "push" || k === "pull") ?? lastUpper;
  }
  if (!ops.length) return null;
  return {
    key: `lifts:${today}:${shown.join(",") || "later"}`,
    title: "Lifts reordered",
    reason: shown.length
      ? `Following what you logged (Push / Pull / Legs): ${shown.join(", ")}.`
      : "Later lift days re-ordered to keep Push / Pull / Legs in rotation.",
    ops,
  };
}
