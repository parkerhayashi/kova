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
  listActivities,
  listWeighIns,
  parseActivityFit,
  toGarminActivityRow,
  toIncomingRun,
  type GarminApiActivity,
  type GarminWeighIn,
} from "@/lib/garmin";
import { addDays, todayInTimezone } from "@/lib/utils";
import type { GarminActivity, RunStreamPoints, Workout } from "@/types";

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
    await recordSync({ garmin_last_synced_at: new Date().toISOString(), garmin_last_error: null });
    return {
      runs_found: runActivities.length,
      rides_found: others.filter((a) => activityKind(a) === "cycling").length,
      strength_found: others.filter((a) => activityKind(a) === "strength").length,
      weigh_ins: weighIns,
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
