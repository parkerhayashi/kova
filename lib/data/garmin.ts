import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getTimezone } from "@/lib/data/oura";
import {
  externalIdsWithLaps,
  ingestActualRuns,
  recomputeDay,
  type IncomingRun,
} from "@/lib/data/running";
import {
  activityKind,
  downloadActivityFit,
  GarminAuthError,
  isGarminConfigured,
  getBodyBatteryCurves,
  getDaySummaries,
  getHrvRange,
  getSleepNight,
  listActivities,
  listWeighIns,
  parseActivityFit,
  toGarminActivityRow,
  toIncomingRun,
  type GarminApiActivity,
  type GarminWeighIn,
} from "@/lib/garmin";
import { computeSleepDebt } from "@/lib/oura";
import { addDays, todayInTimezone } from "@/lib/utils";
import type { GarminActivity, GarminDaily, RunStreamPoints, Workout } from "@/types";

/** First sync (or a manual "sync all") looks back this far. */
const FIRST_SYNC_DAYS = 30;
/** Later syncs re-read a few days before the last sync to catch late uploads and edits. */
const OVERLAP_DAYS = 3;
/** Opening the app syncs in the background when the last sync is older than this. */
const STALE_AFTER_MS = 15 * 60_000;

export type GarminStatus = {
  configured: boolean;
  last_synced_at: string | null;
  /** Last sync's error (e.g. an expired key); cleared by the next good sync. */
  last_error: string | null;
};

export const getGarminStatus = cache(async function getGarminStatus(): Promise<GarminStatus> {
  const configured = isGarminConfigured();
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("garmin_last_synced_at, garmin_last_error")
    .limit(1)
    .maybeSingle();
  const row = data as { garmin_last_synced_at?: string | null; garmin_last_error?: string | null } | null;
  return {
    configured,
    last_synced_at: row?.garmin_last_synced_at ?? null,
    last_error: configured ? (row?.garmin_last_error ?? null) : null,
  };
});

async function recordSync(patch: { garmin_last_synced_at?: string; garmin_last_error: string | null }) {
  const db = createServiceClient();
  const { data: row } = await db.from("user_settings").select("id").limit(1).maybeSingle();
  if (!row) return;
  await db.from("user_settings").update(patch).eq("id", (row as { id: string }).id);
}

export type GarminSyncResult = {
  runs_found: number;
  rides_found: number;
  strength_found: number;
  weigh_ins: number;
  wellness_days: number;
  fit_files: number;
  inserted: number;
  updated: number;
  skipped: number;
};

/** Download + parse an activity's .FIT; failures are logged and retried next sync. */
async function fetchFit(activityId: number) {
  try {
    return parseActivityFit(await downloadActivityFit(activityId));
  } catch (err) {
    if (err instanceof GarminAuthError) throw err;
    console.error(`[garmin] FIT for ${activityId} failed`, err);
    return null;
  }
}

type WeightRow = { date: string; source: string; measured_at: string | null; created_at: string; weight_lbs: number; external_id: string | null };

/** Should the Garmin weigh-in replace what Kova has for that day? The later weigh-in wins. */
export function garminWeighInWins(incoming: GarminWeighIn, existing: WeightRow | null): boolean {
  if (!existing) return true;
  if (existing.source === "garmin") {
    return existing.external_id !== incoming.external_id || existing.weight_lbs !== incoming.weight_lbs;
  }
  const kovaAt = Date.parse(existing.measured_at ?? existing.created_at);
  const garminAt = incoming.measured_at ? Date.parse(incoming.measured_at) : NaN;
  // Without a Garmin time we can't tell which came later — keep the Kova entry.
  return Number.isFinite(garminAt) && Number.isFinite(kovaAt) && garminAt > kovaAt;
}

/**
 * Import Garmin weigh-ins into weight_log (one row per day). Deleted
 * imports stay deleted; a later Kova entry on the same day is kept.
 */
async function syncWeighIns(since: string, today: string): Promise<number> {
  const weighIns = await listWeighIns(since, today);
  if (weighIns.length === 0) return 0;
  const db = createServiceClient();
  const [{ data: existingRows, error }, { data: dismissedRows }] = await Promise.all([
    db
      .from("weight_log")
      .select("date, source, measured_at, created_at, weight_lbs, external_id")
      .in("date", weighIns.map((w) => w.date)),
    db
      .from("dismissed_run_imports")
      .select("external_id")
      .in("external_id", weighIns.map((w) => w.external_id)),
  ]);
  if (error) throw new Error(error.message);
  const existing = new Map(((existingRows as WeightRow[]) ?? []).map((r) => [r.date, r]));
  const dismissed = new Set(((dismissedRows as { external_id: string }[]) ?? []).map((r) => r.external_id));

  let imported = 0;
  for (const w of weighIns) {
    if (dismissed.has(w.external_id) || !garminWeighInWins(w, existing.get(w.date) ?? null)) continue;
    const { error: upsertError } = await db.from("weight_log").upsert(
      {
        date: w.date,
        weight_lbs: w.weight_lbs,
        body_fat_pct: w.body_fat_pct,
        notes: null,
        source: "garmin",
        external_id: w.external_id,
        measured_at: w.measured_at,
        metrics: w.metrics,
      },
      { onConflict: "date" },
    );
    if (upsertError) throw new Error(upsertError.message);
    imported++;
  }
  return imported;
}

/** Oura-only sleep columns, cleared when Garmin takes a night over. */
const OURA_ONLY_SLEEP = {
  latency: null,
  restfulness: null,
  lowest_heart_rate: null,
  restless_periods: null,
  sleep_phase_5min: null,
  movement_30sec: null,
  contributors: null,
  optimal_bedtime_start: null,
  optimal_bedtime_end: null,
  bedtime_recommendation: null,
  bedtime_status: null,
};

/** Oura-only activity columns, cleared when Garmin takes a day over. */
const OURA_ONLY_ACTIVITY = {
  activity_score: null,
  vo2_max: null,
  high_activity_time: null,
  medium_activity_time: null,
  low_activity_time: null,
  sedentary_time: null,
  resting_time: null,
  non_wear_time: null,
  high_activity_met_minutes: null,
  medium_activity_met_minutes: null,
  low_activity_met_minutes: null,
  sedentary_met_minutes: null,
  average_met_minutes: null,
  target_calories: null,
  target_meters: null,
  meters_to_target: null,
  inactivity_alerts: null,
  class_5min: null,
  breathing_disturbance_index: null,
  recovery_high: null,
  stress_summary: null,
  contributors: null,
};

/** Parallel nightly sleep requests. */
const SLEEP_CONCURRENCY = 5;

/** Body Battery points kept per day for the chart. */
const BODY_BATTERY_POINTS = 96;

/**
 * Garmin replaced Oura: nights go into `sleep`, steps / calories into
 * `activity` (continuous history, source = garmin), and Garmin-only stats
 * into `garmin_daily`. Days without watch data are skipped, so Oura history
 * before the switch is left alone; a day both devices recorded becomes Garmin's.
 */
async function syncWellness(syncSince: string, today: string): Promise<number> {
  const db = createServiceClient();
  // First wellness sync backfills a month; after that the usual overlap window.
  const { count } = await db.from("garmin_daily").select("date", { count: "exact", head: true });
  const since = count ? syncSince : addDays(today, -FIRST_SYNC_DAYS);
  // Body Battery curves are capped at 31 days per call.
  const curveStart = since < addDays(today, -30) ? addDays(today, -30) : since;
  const [summaries, hrv, curves] = await Promise.all([
    getDaySummaries(since, today),
    getHrvRange(since, today),
    getBodyBatteryCurves(curveStart, today),
  ]);

  const dates: string[] = [];
  for (let d = since; d <= today; d = addDays(d, 1)) dates.push(d);
  // One call per night (the range endpoint is empty on personal keys) — a few at a time.
  const nights: NonNullable<Awaited<ReturnType<typeof getSleepNight>>>[] = [];
  for (let i = 0; i < dates.length; i += SLEEP_CONCURRENCY) {
    const batch = await Promise.all(dates.slice(i, i + SLEEP_CONCURRENCY).map((d) => getSleepNight(d)));
    for (const n of batch) if (n) nights.push(n);
  }

  // Sleep debt needs the trailing two weeks, Oura nights included.
  if (nights.length > 0) {
    const [{ data: prior }, { data: settings }] = await Promise.all([
      db
        .from("sleep")
        .select("date, total_sleep_duration")
        .gte("date", addDays(since, -14))
        .lt("date", since),
      db.from("user_settings").select("sleep_need_hours").limit(1).maybeSingle(),
    ]);
    const history = [
      ...((prior as { date: string; total_sleep_duration: number | null }[]) ?? []),
      ...nights.map((n) => ({ date: n.date, total_sleep_duration: n.total_sleep_s })),
    ];
    const debt = computeSleepDebt(
      history,
      (settings as { sleep_need_hours?: number | null } | null)?.sleep_need_hours ?? 8,
    );
    const rows = nights.map((n) => {
      const inBed = n.start && n.end ? Math.round((Date.parse(n.end) - Date.parse(n.start)) / 1000) : null;
      return {
        ...OURA_ONLY_SLEEP,
        date: n.date,
        score: n.score,
        total_sleep_duration: n.total_sleep_s,
        rem_sleep_duration: n.rem_s,
        deep_sleep_duration: n.deep_s,
        light_sleep_duration: n.light_s,
        awake_duration: n.awake_s,
        time_in_bed: inBed,
        efficiency: inBed ? Math.round((n.total_sleep_s / inBed) * 100) : null,
        bedtime_start: n.start,
        bedtime_end: n.end,
        average_heart_rate: n.avg_hr,
        average_breath: n.respiration_avg,
        sleep_debt_seconds: debt.get(n.date) ?? null,
        source: "garmin",
      };
    });
    const { error } = await db.from("sleep").upsert(rows, { onConflict: "date" });
    if (error) throw new Error(`sleep: ${error.message}`);
  }

  const withSteps = summaries.filter((s) => s.steps != null || s.total_kcal != null);
  if (withSteps.length > 0) {
    const { error } = await db.from("activity").upsert(
      withSteps.map((s) => ({
        ...OURA_ONLY_ACTIVITY,
        date: s.date,
        steps: s.steps,
        active_calories: s.active_kcal,
        total_calories: s.total_kcal,
        equivalent_walking_distance: s.distance_m,
        // Same meaning as Oura's: minutes at high stress.
        stress_score: s.stress_high_min != null ? Math.round(s.stress_high_min) : null,
        spo2_avg: s.spo2_avg,
        source: "garmin",
      })),
      { onConflict: "date" },
    );
    if (error) throw new Error(`activity: ${error.message}`);
  }

  // Garmin-only stats, merged per day from all four sources.
  const daily = new Map<string, Record<string, unknown>>();
  const row = (date: string) => {
    if (!daily.has(date)) daily.set(date, { date, updated_at: new Date().toISOString() });
    return daily.get(date)!;
  };
  for (const n of nights) {
    Object.assign(row(n.date), {
      sleep_scores: n.scores,
      sleep_feedback: n.feedback,
      sleep_stress_avg: n.sleep_stress_avg,
    });
  }
  for (const h of hrv) {
    Object.assign(row(h.date), {
      hrv_last_night_ms: h.last_night_ms,
      hrv_5min_high_ms: h.five_min_high_ms,
      hrv_weekly_avg_ms: h.weekly_avg_ms,
      hrv_baseline_low_ms: h.baseline_low_ms,
      hrv_baseline_high_ms: h.baseline_high_ms,
      hrv_status: h.status,
      hrv_feedback: h.feedback,
    });
  }
  for (const s of summaries) {
    Object.assign(row(s.date), {
      resting_hr: s.resting_hr,
      min_hr: s.min_hr,
      max_hr: s.max_hr,
      step_goal: s.step_goal,
      floors_ascended: s.floors_ascended,
      intensity_moderate_min: s.intensity_moderate_min,
      intensity_vigorous_min: s.intensity_vigorous_min,
      intensity_goal_weekly: s.intensity_goal_weekly,
      stress_avg: s.stress_avg,
      stress_max: s.stress_max,
      stress_high_min: s.stress_high_min,
      stress_qualifier: s.stress_qualifier,
      body_battery_min: s.body_battery_min,
      body_battery_max: s.body_battery_max,
      body_battery_latest: s.body_battery_latest,
      body_battery_charged: s.body_battery_charged,
      body_battery_drained: s.body_battery_drained,
      respiration_avg: s.respiration_avg,
      spo2_avg: s.spo2_avg,
    });
  }
  for (const [date, points] of Object.entries(curves)) {
    const step = Math.max(1, Math.ceil(points.length / BODY_BATTERY_POINTS));
    row(date).body_battery_curve = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  }
  if (daily.size > 0) {
    const { error } = await db.from("garmin_daily").upsert([...daily.values()], { onConflict: "date" });
    if (error) throw new Error(`garmin_daily: ${error.message}`);
  }
  return daily.size;
}

/**
 * Upsert rides / strength sessions. A ride's trace is fetched once (its
 * .FIT file); summary fields refresh every sync. Ride days are re-run
 * through the fuel calculation — long rides add carbs like long runs.
 */
async function syncOtherActivities(activities: GarminApiActivity[]): Promise<number> {
  if (activities.length === 0) return 0;
  const db = createServiceClient();
  const ids = activities.map((a) => `garmin:${a.activityId}`);
  const { data: existing, error } = await db
    .from("garmin_activities")
    .select("external_id, date, has_stream:stream->t")
    .in("external_id", ids);
  if (error) throw new Error(error.message);
  const known = new Map(
    ((existing as { external_id: string; date: string; has_stream: unknown }[]) ?? []).map((r) => [
      r.external_id,
      r,
    ]),
  );

  let fitFiles = 0;
  const touched = new Set<string>();
  for (const activity of activities) {
    const sport = activityKind(activity);
    if (sport !== "cycling" && sport !== "strength") continue;
    const row = toGarminActivityRow(activity, sport);
    if (!row) continue;
    const prev = known.get(row.external_id);
    let stream: RunStreamPoints | null = null;
    if (sport === "cycling" && !prev?.has_stream) {
      const fit = await fetchFit(activity.activityId);
      if (fit) fitFiles++;
      stream = fit?.stream ?? null;
    }
    const { error: upsertError } = await db
      .from("garmin_activities")
      .upsert(
        { ...row, ...(stream ? { stream } : {}), updated_at: new Date().toISOString() },
        { onConflict: "external_id" },
      );
    if (upsertError) throw new Error(upsertError.message);
    if (sport === "cycling") {
      touched.add(row.date);
      if (prev && prev.date !== row.date) touched.add(prev.date);
    }
  }
  for (const date of touched) await recomputeDay(date);
  return fitFiles;
}

/**
 * Pull Garmin runs into actual_runs. Summary metrics refresh on every sync;
 * the .FIT file (laps + trace) is fetched once per run. Garmin outranks
 * manual and Apple Health records of the same run, so its copy takes over.
 */
export async function syncGarmin(opts: { days?: number } = {}): Promise<GarminSyncResult> {
  if (!isGarminConfigured()) throw new Error("Garmin is not connected — set GARMIN_API_KEY.");
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const { last_synced_at } = await getGarminStatus();

  const since = opts.days
    ? addDays(today, -opts.days)
    : last_synced_at
      ? addDays(last_synced_at.slice(0, 10), -OVERLAP_DAYS)
      : addDays(today, -FIRST_SYNC_DAYS);

  try {
    const activities = await listActivities(since, today);
    const runActivities = activities.filter((a) => activityKind(a) === "run");
    const others = activities.filter((a) => activityKind(a) !== "run");
    const haveLaps = await externalIdsWithLaps(runActivities.map((a) => `garmin:${a.activityId}`));

    const runs: IncomingRun[] = [];
    let fitFiles = 0;
    for (const activity of runActivities) {
      // Summary metrics always import; laps are fetched once (retried next sync on failure).
      const fit = haveLaps.has(`garmin:${activity.activityId}`) ? null : await fetchFit(activity.activityId);
      if (fit) fitFiles++;
      const run = toIncomingRun(activity, fit);
      if (run) runs.push(run);
    }

    const result = await ingestActualRuns("garmin", runs);
    fitFiles += await syncOtherActivities(others);
    const weighIns = await syncWeighIns(since, today);
    const wellnessDays = await syncWellness(since, today);
    await recordSync({ garmin_last_synced_at: new Date().toISOString(), garmin_last_error: null });
    return {
      runs_found: runActivities.length,
      rides_found: others.filter((a) => activityKind(a) === "cycling").length,
      strength_found: others.filter((a) => activityKind(a) === "strength").length,
      weigh_ins: weighIns,
      wellness_days: wellnessDays,
      fit_files: fitFiles,
      ...result,
    };
  } catch (err) {
    await recordSync({ garmin_last_error: err instanceof Error ? err.message : "Garmin sync failed" });
    throw err;
  }
}

/** Background sync when Kova is opened — skipped if Garmin synced recently. */
export async function syncGarminIfStale(): Promise<void> {
  if (!isGarminConfigured()) return;
  const { last_synced_at } = await getGarminStatus();
  if (last_synced_at && Date.now() - Date.parse(last_synced_at) < STALE_AFTER_MS) return;
  try {
    await syncGarmin();
  } catch (err) {
    console.error("[garmin] background sync failed", err);
  }
}

// ---------------------------------------------------------------------------
// Reads: rides and strength sessions
// ---------------------------------------------------------------------------

/** Rides / strength sessions dated in [start, end] (no trace — see getGarminActivityStreams). */
export async function getGarminActivitiesBetween(
  start: string,
  end: string,
  sport?: GarminActivity["sport"],
): Promise<GarminActivity[]> {
  const db = createServiceClient();
  let query = db
    .from("garmin_activities")
    .select(
      "id, external_id, sport, activity_type, name, date, started_at, duration_min, distance_km, avg_hr, max_hr, calories, elevation_gain_m, avg_power_w, avg_cadence_rpm, training_load, aerobic_te, anaerobic_te, metrics, created_at, updated_at",
    )
    .gte("date", start)
    .lte("date", end)
    .order("started_at", { ascending: false });
  if (sport) query = query.eq("sport", sport);
  const { data, error } = await query;
  // Garmin extras are additive — pages still render without them.
  if (error) {
    console.error("[garmin] activities unavailable", error.message);
    return [];
  }
  return (data as GarminActivity[]) ?? [];
}

/** Traces for the given rides, keyed by id. */
export async function getGarminActivityStreams(ids: string[]): Promise<Record<string, RunStreamPoints>> {
  if (ids.length === 0) return {};
  const db = createServiceClient();
  const { data, error } = await db.from("garmin_activities").select("id, stream").in("id", ids);
  if (error) {
    console.error("[garmin] streams unavailable", error.message);
    return {};
  }
  const out: Record<string, RunStreamPoints> = {};
  for (const row of (data as { id: string; stream: RunStreamPoints | null }[]) ?? []) {
    if (row.stream) out[row.id] = row.stream;
  }
  return out;
}

/** Overlap tolerance when pairing a Hevy workout with a Garmin strength session. */
const STRENGTH_MATCH_SLACK_MS = 15 * 60_000;

/**
 * Pair Hevy workouts with Garmin strength sessions recorded at the same time
 * (sets come from Hevy, heart rate and training load from Garmin).
 */
export function matchStrengthSessions(
  workouts: Pick<Workout, "id" | "start_time" | "end_time" | "duration">[],
  sessions: GarminActivity[],
): Record<string, GarminActivity> {
  const out: Record<string, GarminActivity> = {};
  const used = new Set<string>();
  for (const w of workouts) {
    if (!w.start_time) continue;
    const wStart = Date.parse(w.start_time);
    const wEnd = w.end_time ? Date.parse(w.end_time) : wStart + (w.duration ?? 3600) * 1000;
    const match = sessions.find((s) => {
      if (s.sport !== "strength" || !s.started_at || used.has(s.id)) return false;
      const sStart = Date.parse(s.started_at);
      const sEnd = sStart + s.duration_min * 60_000;
      return sStart < wEnd + STRENGTH_MATCH_SLACK_MS && wStart < sEnd + STRENGTH_MATCH_SLACK_MS;
    });
    if (match) {
      used.add(match.id);
      out[w.id] = match;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reads: Garmin daily stats (Body Battery, HRV, intensity, stress…)
// ---------------------------------------------------------------------------

/** Garmin daily rows for the last `days`, oldest first (without the Body Battery curve). */
export const getGarminDailyHistory = cache(async function getGarminDailyHistory(
  days: number,
): Promise<GarminDaily[]> {
  const today = todayInTimezone(await getTimezone());
  const db = createServiceClient();
  const { data, error } = await db
    .from("garmin_daily")
    .select(
      "date, sleep_scores, sleep_feedback, sleep_stress_avg, hrv_last_night_ms, hrv_5min_high_ms, hrv_weekly_avg_ms, hrv_baseline_low_ms, hrv_baseline_high_ms, hrv_status, hrv_feedback, resting_hr, min_hr, max_hr, step_goal, floors_ascended, intensity_moderate_min, intensity_vigorous_min, intensity_goal_weekly, stress_avg, stress_max, stress_high_min, stress_qualifier, body_battery_min, body_battery_max, body_battery_latest, body_battery_charged, body_battery_drained, respiration_avg, spo2_avg, updated_at",
    )
    .gte("date", addDays(today, -days))
    .order("date", { ascending: true });
  // Garmin stats are additive — pages still render on Oura history without them.
  if (error) {
    console.error("[garmin] daily stats unavailable", error.message);
    return [];
  }
  return ((data as Omit<GarminDaily, "body_battery_curve">[]) ?? []).map((r) => ({
    ...r,
    body_battery_curve: null,
  }));
});

/** One day's Garmin stats including the Body Battery curve. */
export async function getGarminDailyFor(date: string): Promise<GarminDaily | null> {
  const db = createServiceClient();
  const { data, error } = await db.from("garmin_daily").select("*").eq("date", date).maybeSingle();
  if (error) return null;
  return (data as GarminDaily | null) ?? null;
}

/**
 * Morning Body Battery for a day — the stand-in wherever Kova used Oura
 * readiness (coach, "good to train" hint). Null without Garmin data.
 */
export async function getMorningBodyBattery(date: string): Promise<number | null> {
  const rows = await getGarminDailyHistory(7);
  return rows.find((r) => r.date === date)?.body_battery_max ?? null;
}
