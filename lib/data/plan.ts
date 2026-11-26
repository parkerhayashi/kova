import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getGarminActivitiesBetween } from "@/lib/data/garmin";
import { listHevyWorkoutsBetween } from "@/lib/data/hevy";
import { getInjuries } from "@/lib/data/injuries";
import { getTimezone } from "@/lib/data/oura";
import { getPerformance } from "@/lib/data/performance";
import { deletePlannedRun, getUpcomingRace, savePlannedRun, type UpcomingRace } from "@/lib/data/running";
import { injuryName, isLowerBody } from "@/lib/injuries";
import { proposeChanges, reconcile, reflowWeek, type AdaptWorkout, type Proposal, type WorkoutState } from "@/lib/plan-adapt";
import { classifyLift, fuelRunType, generatePlan, mondayOf, planCounts, targets, type LiftKind, type RunWalkItem } from "@/lib/plan-engine";
import { qualifiesForFueling, raceTitle } from "@/lib/run-fuel";
import { addDays, daysBetween, formatIsoDateLabel, normalizeIsoDate, todayInTimezone } from "@/lib/utils";
import type { ActualRun, PlanOp, PlanSettings, PlanSuggestion, PlanWorkout, TrainingPlan } from "@/types";

const day = (v: string) => normalizeIsoDate(v) ?? v;
/** Average race pace guess (min/mi) when there are no predictions yet. */
const FALLBACK_RACE_MIN_PER_MILE = 13;

export type PlanWorkoutView = AdaptWorkout & {
  /** What was actually done, when matched. */
  actual: { title: string; minutes: number; source: "run" | "ride" | "lift" } | null;
};

export type ActivePlan = {
  plan: TrainingPlan;
  workouts: PlanWorkoutView[];
  suggestions: PlanSuggestion[];
  /** Changes Kova made on its own in the last week, newest first. */
  adjustments: PlanSuggestion[];
  review: { week_start: string; summary: string } | null;
  race: UpcomingRace | null;
  current: { phase: string; week: number; weeks: number };
};

// ---------------------------------------------------------------------------
// Reading + matching
// ---------------------------------------------------------------------------

async function loadPlan(): Promise<{ plan: TrainingPlan; workouts: PlanWorkout[] } | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("training_plans")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  // Plans are additive — Training still renders without the tables.
  if (error || !data) return null;
  const plan = { ...(data as TrainingPlan), start_date: day((data as TrainingPlan).start_date), end_date: day((data as TrainingPlan).end_date) };
  const { data: rows } = await db.from("plan_workouts").select("*").eq("plan_id", plan.id).order("date");
  return { plan, workouts: ((rows as PlanWorkout[]) ?? []).map((w) => ({ ...w, date: day(w.date) })) };
}

/**
 * Match logged activities to planned workouts: same day first, then a run
 * done a day early / late counts for an unmatched planned run.
 */
type Matched = { workouts: PlanWorkoutView[] };

/**
 * Plans are weekly targets, so matching is by week: whatever was logged in a
 * week checks off that week's sessions — runs in order (a run long enough
 * counts as the long run), lifts by Push / Pull / Legs from the Hevy title,
 * rides in order. Unfinished sessions only count as missed once their week
 * is over.
 */
async function matchWorkouts(workouts: PlanWorkout[], today: string, planStart: string): Promise<Matched> {
  if (workouts.length === 0) return { workouts: [] };
  // Only what was logged once the plan started counts toward it.
  const start = planStart;
  const end = today;
  const db = createServiceClient();
  const [runRes, garmin, lifts] = await Promise.all([
    db.from("actual_runs").select("id, date, actual_duration_min, actual_distance_km").gte("date", start).lte("date", end),
    getGarminActivitiesBetween(start, end),
    listHevyWorkoutsBetween(start, end),
  ]);
  type Done = { id: string; date: string; minutes: number; title: string; sport: "run" | "ride" | "lift"; kind: LiftKind | null };
  const pool: Done[] = [
    ...(((runRes.data as Pick<ActualRun, "id" | "date" | "actual_duration_min" | "actual_distance_km">[]) ?? []).map((r) => ({
      id: r.id,
      date: day(r.date),
      minutes: r.actual_duration_min,
      title: r.actual_distance_km ? `Run · ${(r.actual_distance_km / 1.609344).toFixed(1)} mi` : `Run · ${Math.round(r.actual_duration_min)} min`,
      sport: "run" as const,
      kind: null,
    }))),
    ...garmin
      .filter((a) => a.sport === "cycling")
      .map((a) => ({ id: a.id, date: a.date, minutes: a.duration_min, title: `Ride · ${Math.round(a.duration_min)} min`, sport: "ride" as const, kind: null })),
    ...lifts
      .filter((w) => w.date)
      .map((w) => ({ id: w.id, date: w.date!, minutes: (w.duration ?? 0) / 60, title: w.title ?? "Lift", sport: "lift" as const, kind: classifyLift(w.title) })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const matched = new Map<string, Done>();
  const live = workouts.filter((w) => w.status !== "skipped");
  const byDate = (a: PlanWorkout, b: PlanWorkout) => a.date.localeCompare(b.date);
  for (const done of pool) {
    const week = mondayOf(done.date);
    const open = live
      .filter((w) => !matched.has(w.id) && w.sport === done.sport && mondayOf(w.date) === week)
      .sort(byDate);
    let hit: PlanWorkout | undefined;
    if (done.sport === "run") {
      const race = open.find((w) => w.kind === "race" && w.date === done.date);
      const runs = open.filter((w) => w.kind !== "race");
      const long = runs.find((w) => w.kind.startsWith("long"));
      hit =
        race ??
        (long && long !== runs[0] && done.minutes >= (long.duration_min ?? Infinity) * 0.8 ? long : runs[0]);
    } else if (done.sport === "lift") {
      hit = open.find((w) => w.kind === done.kind) ?? open.find((w) => w.kind === "full") ?? open[0];
    } else {
      hit = open[0];
    }
    if (hit) matched.set(hit.id, done);
  }
  const thisWeek = mondayOf(today);
  const views = workouts.map((w): PlanWorkoutView => {
    const hit = matched.get(w.id) ?? null;
    const past = w.kind === "race" ? w.date < today : mondayOf(w.date) < thisWeek;
    const state: WorkoutState =
      w.status === "skipped" ? "skipped" : hit ? "done" : past ? "missed" : w.date === today ? "today" : "upcoming";
    return {
      ...w,
      state,
      actual_min: hit?.minutes ?? null,
      actual_date: hit?.date ?? null,
      actual_kind: hit?.kind ?? null,
      actual: hit ? { title: hit.title, minutes: Math.round(hit.minutes), source: hit.sport } : null,
    };
  });
  return { workouts: views };
}

async function buildActivePlan(): Promise<ActivePlan | null> {
  const loaded = await loadPlan();
  if (!loaded) return null;
  const today = todayInTimezone(await getTimezone());
  const db = createServiceClient();
  const [matched, sugg, review, race] = await Promise.all([
    matchWorkouts(loaded.workouts, today, loaded.plan.start_date),
    db.from("plan_suggestions").select("*").eq("plan_id", loaded.plan.id).in("status", ["pending", "accepted"]).order("created_at"),
    db.from("plan_reviews").select("week_start, summary").eq("plan_id", loaded.plan.id).order("week_start", { ascending: false }).limit(1).maybeSingle(),
    getUpcomingRace(today),
  ]);
  const { workouts } = matched;
  const rows = (sugg.data as PlanSuggestion[]) ?? [];
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const current = workouts.find((w) => w.date >= today) ?? workouts.at(-1);
  return {
    plan: loaded.plan,
    workouts,
    suggestions: rows.filter((r) => r.status === "pending" && r.source !== "auto"),
    adjustments: rows.filter((r) => r.source === "auto" && r.created_at >= weekAgo).reverse(),
    review: (review.data as { week_start: string; summary: string } | null) ?? null,
    race,
    current: {
      phase: current?.phase ?? "base",
      week: (current?.week_index ?? 0) + 1,
      weeks: (workouts.at(-1)?.week_index ?? 0) + 1,
    },
  };
}

/** The active plan with matched states, pending suggestions and the latest AI review. */
export const getActivePlan = cache(buildActivePlan);

/**
 * Adapt the plan to what was actually done (missed / off-plan sessions, lift
 * rotation) and apply it — no confirmation. Each change is logged as an
 * "auto" adjustment the plan card shows. Call before getActivePlan() in a
 * request so the page renders the adjusted plan.
 */
export async function reconcilePlan(opts: { dryRun?: boolean } = {}): Promise<number | Proposal[]> {
  const db = createServiceClient();
  const [perf, injuries] = await Promise.all([getPerformance(90), getInjuries(false)]);
  const easyTarget = targets({ paceZones: perf.paceZones, hrFloors: perf.hrZones?.floors ?? null }).easy;
  const lowerPain = Math.max(0, ...injuries.filter((v) => isLowerBody(v.injury.body_part)).map((v) => v.severity)) || null;
  const today = todayInTimezone(await getTimezone());
  let applied = 0;
  for (let pass = 0; pass < 6; pass++) {
    const built = await buildActivePlan();
    if (!built || !built.race) return applied;
    const { data: keys } = await db.from("plan_suggestions").select("key").eq("plan_id", built.plan.id).eq("source", "auto");
    const proposals = reconcile({
      today,
      workouts: built.workouts,
      settings: built.plan.settings,
      raceDate: built.race.date,
      planStart: built.plan.start_date,
      easyTarget,
      recovery: perf.recovery.score,
      lowerPain,
      appliedKeys: new Set(((keys as { key: string }[]) ?? []).map((k) => k.key)),
    });
    if (opts.dryRun) return proposals;
    if (proposals.length === 0) return applied;
    for (const p of proposals) {
      await applyOps(built.plan.id, p.ops, { syncFuel: false });
      if (!p.silent) {
        const { silent: _s, ...row } = p;
        void _s;
        await db.from("plan_suggestions").upsert(
          { plan_id: built.plan.id, source: "auto", status: "accepted", resolved_at: new Date().toISOString(), ...row },
          { onConflict: "plan_id,key", ignoreDuplicates: true },
        );
      }
      applied++;
    }
    await syncDesignations(built.plan.id);
  }
  return applied;
}

// ---------------------------------------------------------------------------
// Creating a plan
// ---------------------------------------------------------------------------

export type CreatePlanInput = { settings: PlanSettings; include_run_walk: boolean };

/** Generate and save a new plan toward the next race (archiving any active plan). */
export async function createPlan(input: CreatePlanInput): Promise<TrainingPlan> {
  const c = planCounts(input.settings);
  const s: PlanSettings = {
    runs_per_week: c.runs,
    lifts_per_week: c.lifts,
    rides_per_week: c.rides,
    legs_per_week: c.legs,
    long_run_weekend_min: c.weekendLongMin,
    goal_time_min: input.settings.goal_time_min,
  };
  const today = todayInTimezone(await getTimezone());
  const race = await getUpcomingRace(today);
  if (!race || race.distance_km == null) throw new Error("Add your goal race on the Training calendar first");

  const db = createServiceClient();
  const [queueRes, perf] = await Promise.all([
    input.include_run_walk
      ? db.from("training_plan_runs").select("run_type, distance_km, duration_min, notes").is("actual_run_id", null).order("position")
      : Promise.resolve({ data: [] }),
    getPerformance(90),
  ]);
  const predicted = perf.predictions.predictions.find((p) => p.key === "race")?.minutes;
  const estimate = s.goal_time_min ?? predicted ?? (race.distance_km / 1.609344) * FALLBACK_RACE_MIN_PER_MILE;

  const preview = generatePlan({
    start: addDays(today, 1),
    race: {
      date: race.date,
      km: race.distance_km,
      name: raceTitle({ race_name: race.name, event_type: race.event_type }, race.distance_km),
      estimate_min: estimate,
    },
    settings: s,
    runWalk: (queueRes.data as RunWalkItem[]) ?? [],
    paceZones: perf.paceZones,
    hrFloors: perf.hrZones?.floors ?? null,
  });

  // Retire the old plan (its future fuel designations go with it).
  const old = await loadPlan();
  if (old) {
    for (const w of old.workouts) if (w.planned_run_id && w.date >= today) await deletePlannedRun(w.planned_run_id);
    await db.from("training_plans").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", old.plan.id);
  }

  const { data: plan, error } = await db
    .from("training_plans")
    .insert({ goal_race_id: race.id, start_date: addDays(today, 1), end_date: race.date, settings: s })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const rows = preview.workouts.map((w) => ({ ...w, plan_id: (plan as TrainingPlan).id }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error: insertError } = await db.from("plan_workouts").insert(rows.slice(i, i + 200));
    if (insertError) throw new Error(insertError.message);
  }
  await syncDesignations((plan as TrainingPlan).id);
  return plan as TrainingPlan;
}

// ---------------------------------------------------------------------------
// Run-fuel designations for long / quality runs
// ---------------------------------------------------------------------------

/**
 * Upcoming planned runs that qualify for fueling get a planned_runs
 * designation (so the day's carb target rises); everything else loses one.
 */
export async function syncDesignations(planId: string): Promise<void> {
  const db = createServiceClient();
  const today = todayInTimezone(await getTimezone());
  const { data } = await db.from("plan_workouts").select("*").eq("plan_id", planId).gte("date", today);
  const rows = ((data as PlanWorkout[]) ?? []).map((r) => ({ ...r, date: day(r.date) }));
  // Skip designations that already match (reconcile calls this often).
  const ids = rows.map((w) => w.planned_run_id).filter((id): id is string => !!id);
  const { data: existing } = ids.length
    ? await db.from("planned_runs").select("id, date, run_type, planned_duration_min").in("id", ids)
    : { data: [] };
  const current = new Map(
    ((existing as { id: string; date: string; run_type: string; planned_duration_min: number | null }[]) ?? []).map((p) => [p.id, p]),
  );
  for (const w of rows) {
    const type = fuelRunType(w.kind);
    if (w.sport === "run" && w.status === "planned" && type !== "race" && qualifiesForFueling(type, w.duration_min)) {
      const have = w.planned_run_id ? current.get(w.planned_run_id) : undefined;
      if (have && day(have.date) === w.date && have.run_type === type && have.planned_duration_min === w.duration_min) continue;
      const { planned } = await savePlannedRun({
        id: w.planned_run_id ?? undefined,
        date: w.date,
        run_type: type,
        planned_duration_min: w.duration_min,
        planned_distance_km: w.distance_km,
      });
      if (planned.id !== w.planned_run_id) {
        await db.from("plan_workouts").update({ planned_run_id: planned.id }).eq("id", w.id);
      }
    } else if (w.planned_run_id) {
      await deletePlannedRun(w.planned_run_id);
      await db.from("plan_workouts").update({ planned_run_id: null }).eq("id", w.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Edits + suggestions
// ---------------------------------------------------------------------------

async function planIdOf(workoutId: string): Promise<string> {
  const db = createServiceClient();
  const { data } = await db.from("plan_workouts").select("plan_id").eq("id", workoutId).maybeSingle();
  if (!data) throw new Error("Workout not found");
  return (data as { plan_id: string }).plan_id;
}

async function applyOps(planId: string, ops: PlanOp[], opts: { syncFuel?: boolean } = {}): Promise<void> {
  const db = createServiceClient();
  const now = new Date().toISOString();
  for (const op of ops) {
    if (op.op === "update") {
      const changes = { ...op.changes, ...(op.changes.date ? { date: normalizeIsoDate(op.changes.date) } : {}) };
      const { error } = await db.from("plan_workouts").update({ ...changes, updated_at: now }).eq("id", op.id).eq("plan_id", planId);
      if (error) throw new Error(error.message);
    } else if (op.op === "skip") {
      await db.from("plan_workouts").update({ status: "skipped", updated_at: now }).eq("id", op.id).eq("plan_id", planId);
    } else if (op.op === "insert") {
      const { error } = await db.from("plan_workouts").insert({ ...op.workout, plan_id: planId });
      if (error) throw new Error(error.message);
    } else if (op.op === "shift") {
      const { data } = await db.from("plan_workouts").select("id, date, sport").eq("plan_id", planId).gte("date", op.from_date);
      for (const w of (data as { id: string; date: string; sport: string }[]) ?? []) {
        if (op.sport && w.sport !== op.sport) continue;
        await db.from("plan_workouts").update({ date: addDays(day(w.date), op.days), updated_at: now }).eq("id", w.id);
      }
    }
  }
  if (opts.syncFuel !== false) await syncDesignations(planId);
}

/**
 * Move a session to a day of Parker's choosing and pin it there; the rest of
 * its old and new weeks re-plan around it (spacing rules still apply).
 */
export async function moveWorkout(id: string, date: string): Promise<void> {
  const target = normalizeIsoDate(date);
  if (!target) throw new Error("Pick a date");
  const active = await buildActivePlan();
  if (!active) throw new Error("No active plan");
  const w = active.workouts.find((x) => x.id === id);
  if (!w) throw new Error("Workout not found");
  if (w.state === "done") throw new Error("That one's already done");
  if (w.kind === "race") throw new Error("Race day is fixed");
  const today = todayInTimezone(await getTimezone());
  if (target < today) throw new Error("Pick today or a later day");
  // Logs before the plan's first day don't count toward it, so a session there could never be checked off.
  if (target < active.plan.start_date) {
    throw new Error(`The plan starts ${formatIsoDateLabel(active.plan.start_date, { weekday: "short", month: "short", day: "numeric" })} — pick that day or later`);
  }
  if (active.race && target >= active.race.date) throw new Error("Pick a day before the race");

  const planMonday = mondayOf(active.plan.start_date);
  const week_index = Math.max(0, Math.round(daysBetween(mondayOf(target), planMonday) / 7));
  await applyOps(active.plan.id, [{ op: "update", id, changes: { date: target, pinned: true, week_index } }], { syncFuel: false });
  await reflowWeeks(active.plan, [mondayOf(w.date), mondayOf(target)], today);
}

/** Let Kova place a pinned session again (it re-plans that week). */
export async function unpinWorkout(id: string): Promise<void> {
  const planId = await planIdOf(id);
  const db = createServiceClient();
  const { data } = await db.from("plan_workouts").select("date").eq("id", id).maybeSingle();
  await applyOps(planId, [{ op: "update", id, changes: { pinned: false } }], { syncFuel: false });
  const active = await buildActivePlan();
  if (active && data) await reflowWeeks(active.plan, [mondayOf(day((data as { date: string }).date))], todayInTimezone(await getTimezone()));
}

async function reflowWeeks(plan: TrainingPlan, weeks: string[], today: string): Promise<void> {
  const active = await buildActivePlan();
  if (!active?.race) return;
  const perf = await getPerformance(90);
  const ops = [...new Set(weeks)]
    .filter((wk) => wk >= mondayOf(today))
    .flatMap((wk) =>
      reflowWeek(active.workouts, wk, { today, raceDate: active.race!.date, settings: plan.settings, recovery: perf.recovery.score }),
    );
  await applyOps(plan.id, ops);
}

export async function setWorkoutSkipped(id: string, skipped: boolean): Promise<void> {
  const planId = await planIdOf(id);
  const db = createServiceClient();
  await db.from("plan_workouts").update({ status: skipped ? "skipped" : "planned", updated_at: new Date().toISOString() }).eq("id", id);
  await syncDesignations(planId);
}

export async function resolveSuggestion(id: string, accept: boolean): Promise<void> {
  const db = createServiceClient();
  const { data } = await db.from("plan_suggestions").select("*").eq("id", id).maybeSingle();
  const s = data as PlanSuggestion | null;
  if (!s || s.status !== "pending") throw new Error("Suggestion not found");
  if (accept) await applyOps(s.plan_id, s.ops);
  await db
    .from("plan_suggestions")
    .update({ status: accept ? "accepted" : "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", id);
}

/** Store suggestions that don't exist yet (a dismissed one never comes back). */
export async function saveSuggestions(
  planId: string,
  source: "rules" | "ai",
  proposals: { key: string; title: string; reason: string; ops: PlanOp[] }[],
): Promise<number> {
  if (proposals.length === 0) return 0;
  const db = createServiceClient();
  const { data, error } = await db
    .from("plan_suggestions")
    .upsert(
      proposals.map((p) => ({ plan_id: planId, source, ...p })),
      { onConflict: "plan_id,key", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(error.message);
  return (data as unknown[] | null)?.length ?? 0;
}

/** Run the adaptation rules against today's data and store new suggestions. */
export async function refreshRuleSuggestions(): Promise<number> {
  const active = await getActivePlan();
  if (!active) return 0;
  const [perf, injuries] = await Promise.all([getPerformance(90), getInjuries(false)]);
  const proposals = proposeChanges({
    today: perf.today,
    workouts: active.workouts,
    recovery: perf.recovery.score,
    ratio: perf.current?.ratio ?? null,
    injuries: injuries.map((v) => {
      const last2 = v.checkins.slice(-2).map((c) => c.severity);
      return {
        id: v.injury.id,
        name: injuryName(v.injury),
        severity: v.severity,
        lower: isLowerBody(v.injury.body_part),
        rising: last2.length === 2 && last2[1]! > last2[0]!,
      };
    }),
    easyTarget: targets({ paceZones: perf.paceZones, hrFloors: perf.hrZones?.floors ?? null }).easy,
  });
  return saveSuggestions(active.plan.id, "rules", proposals);
}

/** Pending suggestions, read fresh (after rules may have just added some). */
export async function getPendingSuggestions(planId: string): Promise<PlanSuggestion[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("plan_suggestions")
    .select("*")
    .eq("plan_id", planId)
    .eq("status", "pending")
    .order("created_at");
  return (data as PlanSuggestion[]) ?? [];
}

/** Run/walk sessions still waiting in the old queue (offered as the plan's first block). */
export async function countRunWalkQueue(): Promise<number> {
  const db = createServiceClient();
  const { count } = await db
    .from("training_plan_runs")
    .select("id", { count: "exact", head: true })
    .is("actual_run_id", null);
  return count ?? 0;
}

/** Next planned run on or after today (Running page, Home). */
export function nextPlannedRun(plan: ActivePlan | null): PlanWorkoutView | null {
  return plan?.workouts.find((w) => w.sport === "run" && (w.state === "today" || w.state === "upcoming")) ?? null;
}
