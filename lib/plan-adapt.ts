/**
 * Plan adaptation — pure.
 *
 * reconcile(): follows what Parker actually did and is applied automatically.
 * Plans are weekly targets: whatever is logged in a week checks off that
 * week's sessions (lifts by Push / Pull / Legs), the rest re-flows over the
 * days left (easy-only or rest today when Recovery is low), run/walk sessions
 * left at the end of a week carry forward in order, and a cut-short run/walk
 * repeats its level.
 *
 * proposeChanges(): judgment calls (injury, pain, ramp rate) — stored
 * as suggestions; nothing changes until one is accepted.
 */
import { addDays, daysBetween } from "@/lib/utils";
import {
  dayRange,
  easySteps,
  liftNotes,
  liftTitle,
  mondayOf,
  parseRunWalk,
  planCounts,
  runWalkSteps,
  scheduleWeek,
  stepsMinutes,
  weekday,
  WEEKDAYS,
  type Booked,
  type LiftKind,
} from "@/lib/plan-engine";
import type { PlanOp, PlanSettings, PlanWorkout } from "@/types";

export type WorkoutState = "done" | "missed" | "skipped" | "today" | "upcoming";

export type AdaptWorkout = PlanWorkout & {
  state: WorkoutState;
  /** Matched activity duration (min) when done. */
  actual_min: number | null;
  /** Day the matched activity was done. */
  actual_date?: string | null;
  /** Lift kind of the matched Hevy workout (from its title). */
  actual_kind?: LiftKind | null;
};

export type Proposal = { key: string; title: string; reason: string; ops: PlanOp[]; silent?: boolean };

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
  /** First day of the plan (its Monday is week 0). */
  planStart: string;
  easyTarget: string | null;
  recovery: number | null;
  /** Worst active lower-body pain (0–10), if any. */
  lowerPain: number | null;
  /** Keys of adjustments already applied (each one-time rule fires once). */
  appliedKeys: Set<string>;
};

const pending = (w: AdaptWorkout) => w.state === "upcoming" || w.state === "today";

/**
 * One pass of automatic adjustments; the caller applies the first proposal,
 * re-matches, and calls again until nothing changes. Silent proposals are
 * bookkeeping (dates following reality) and aren't listed on the plan card.
 */
export function reconcile(input: ReconcileInput): Proposal[] {
  const { workouts } = input;
  // Before the plan starts, "today" for scheduling is its first day.
  const today = input.today < input.planStart ? input.planStart : input.today;
  const live = workouts.filter((w) => w.state !== "skipped");
  const week = mondayOf(today);
  const weekEnd = [addDays(week, 6), addDays(input.raceDate, -1)].sort()[0]!;
  const c = planCounts(input.settings);
  const planMonday = mondayOf(input.planStart);

  // 1. Done sessions sit on the day (and, for lifts, the kind) actually done.
  const sync: PlanOp[] = [];
  const swapped = new Set<string>();
  const liftChanges = (k: string) => ({ kind: k, title: liftTitle(k), notes: liftNotes(k) });
  for (const w of live.filter((w) => w.state === "done" && w.actual_date)) {
    const changes: Extract<PlanOp, { op: "update" }>["changes"] = {};
    if (w.actual_date !== w.date) changes.date = w.actual_date!;
    if (w.sport === "lift" && w.actual_kind && w.actual_kind !== w.kind) {
      Object.assign(changes, liftChanges(w.actual_kind));
      // Did Legs in a Push slot → the week's pending Legs becomes the Push.
      const other = live.find(
        (o) => o.sport === "lift" && pending(o) && !swapped.has(o.id) && o.kind === w.actual_kind && mondayOf(o.date) === mondayOf(w.date),
      );
      if (other) {
        swapped.add(other.id);
        sync.push({ op: "update", id: other.id, changes: liftChanges(w.kind) });
      }
    }
    if (Object.keys(changes).length) sync.push({ op: "update", id: w.id, changes });
  }
  // A pinned day that passed without the session: let Kova place it again.
  for (const w of live.filter((w) => w.pinned && pending(w) && w.date < today)) {
    sync.push({ op: "update", id: w.id, changes: { pinned: false } });
  }
  if (sync.length) return [{ key: `sync:${today}`, title: "", reason: "", ops: sync, silent: true }];

  // 2. Run/walk sessions left over from past weeks carry forward in order;
  //    continuous runs they now overlap are dropped.
  const leftovers = live.filter((w) => isRunWalk(w) && w.state === "missed");
  const carryKey = `rw-carry:${week}`;
  if (leftovers.length && !input.appliedKeys.has(carryKey)) {
    const queue = [...leftovers, ...live.filter((w) => isRunWalk(w) && pending(w) && !pinnedAhead(w, today))].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    const doneThisWeek = live.filter((w) => isRun(w) && w.state === "done" && w.date >= week).length;
    const daysLeft = dayRange(today, weekEnd).length;
    const raceWeek = mondayOf(input.raceDate);
    const placed = new Map<string, string>(); // id → week
    let wk = week;
    let room = Math.min(daysLeft, Math.max(0, c.runs - doneThisWeek));
    for (const w of queue) {
      while (room <= 0 && wk < raceWeek) {
        wk = addDays(wk, 7);
        room = c.runs;
      }
      if (wk >= raceWeek) break;
      placed.set(w.id, wk);
      room--;
    }
    const weeks = [...new Set(placed.values())];
    const ops: PlanOp[] = [];
    const dropped = live.filter(
      (w) => isRun(w) && !isRunWalk(w) && pending(w) && !pinnedAhead(w, today) && weeks.includes(mondayOf(w.date)),
    );
    for (const w of dropped) ops.push({ op: "skip", id: w.id });
    for (const wk of weeks) {
      const days = wk === week ? dayRange(today, weekEnd) : dayRange(wk, addDays(wk, 6));
      const items = live.filter(
        (w) =>
          placed.get(w.id) === wk ||
          (!placed.has(w.id) && pending(w) && !pinnedAhead(w, today) && mondayOf(w.date) === wk && !dropped.includes(w) && w.kind !== "race"),
      );
      const dates = scheduleWeek({
        items: items.map((w, i) => ({ id: w.id, sport: w.sport, kind: w.kind, duration_min: w.duration_min, seq: placed.has(w.id) ? queue.indexOf(w) : 1000 + i })),
        days,
        booked: bookedNear(live, wk, today),
        weekendLongMin: c.weekendLongMin,
      });
      for (const w of items) {
        const date = dates.get(w.id) ?? days[0]!;
        const week_index = Math.round(daysBetween(wk, planMonday) / 7);
        if (date !== w.date || week_index !== w.week_index) ops.push({ op: "update", id: w.id, changes: { date, week_index } });
      }
    }
    const n = leftovers.length;
    return [
      {
        key: carryKey,
        title: `${n} run/walk session${n === 1 ? "" : "s"} carried into this week`,
        reason: `Levels go in order, so ${leftovers.map((w) => w.title.split(" · ")[0]).join(", ")} ${n === 1 ? "moves" : "move"} forward and the progression slides back${dropped.length ? ` (${dropped.length} continuous run${dropped.length === 1 ? "" : "s"} dropped to make room)` : ""}.`,
        ops,
      },
    ];
  }

  // 3. Run/walk cut short (<80% of planned): repeat that level next time.
  const lastRw = live.filter((w) => isRunWalk(w) && w.state === "done").sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const nextRw = live.filter((w) => isRunWalk(w) && pending(w) && w.kind.includes("run_walk")).sort((a, b) => a.date.localeCompare(b.date))[0];
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
          reason: `${dayLabel(lastRw.actual_date ?? lastRw.date)}'s run/walk was ${Math.round(lastRw.actual_min)} of ${Math.round(lastRw.duration_min)} min, so the next one repeats ${last.run}:${last.walk} before moving to ${next.run}:${next.walk}.`,
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

  // 4. Re-flow what's left of this week over the days left (silent), around pinned sessions.
  const ops = reflowWeek(live, week, { today, raceDate: input.raceDate, settings: input.settings, recovery: input.recovery, lowerPain: input.lowerPain });
  if (ops.length) return [{ key: `reflow:${today}`, title: "", reason: "", ops, silent: true }];
  return [];
}

/** A pinned session Parker moved, still ahead — re-planning works around it. */
const pinnedAhead = (w: AdaptWorkout, today: string) => !!w.pinned && pending(w) && w.date >= today;

/**
 * New dates for one week's unpinned, not-yet-done sessions over the days left
 * (from today for this week, the whole week for a later one). Done and pinned
 * sessions stay put and shape the spacing. Low Recovery keeps today easy; very
 * low Recovery or lower-body pain 6+ leaves today empty.
 */
export function reflowWeek(
  live: AdaptWorkout[],
  week: string,
  opts: { today: string; raceDate: string; settings: PlanSettings; recovery?: number | null; lowerPain?: number | null },
): PlanOp[] {
  const { today } = opts;
  const end = [addDays(week, 6), addDays(opts.raceDate, -1)].sort()[0]!;
  const from = week > today ? week : today;
  if (from > end) return [];
  const items = live.filter(
    (w) => pending(w) && !pinnedAhead(w, today) && w.kind !== "race" && w.date >= week && w.date <= addDays(week, 6),
  );
  if (!items.length) return [];
  const isThisWeek = week === mondayOf(today);
  const lowRecovery = isThisWeek && opts.recovery != null && opts.recovery < 45;
  const rest = isThisWeek && ((opts.recovery != null && opts.recovery < 35) || (opts.lowerPain ?? 0) >= 6);
  const dates = scheduleWeek({
    items: items
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((w, i) => ({ id: w.id, sport: w.sport, kind: w.kind, duration_min: w.duration_min, seq: i })),
    days: dayRange(from, end),
    booked: bookedNear(live, week, today),
    weekendLongMin: planCounts(opts.settings).weekendLongMin,
    avoidHard: lowRecovery ? new Set([today]) : undefined,
    rest: rest ? new Set([today]) : undefined,
  });
  return items
    .filter((w) => dates.get(w.id) && dates.get(w.id) !== w.date)
    .map((w): PlanOp => ({ op: "update", id: w.id, changes: { date: dates.get(w.id)! } }));
}

/** Done and pinned sessions from 3 days before the week through its end (spacing context). */
function bookedNear(live: AdaptWorkout[], week: string, today: string): Booked[] {
  return live
    .filter((w) => (w.state === "done" || pinnedAhead(w, today)) && w.date >= addDays(week, -3) && w.date <= addDays(week, 6))
    .map((w) => ({ date: w.date, sport: w.sport, kind: w.kind }));
}
