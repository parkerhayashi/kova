import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getTimezone } from "@/lib/data/oura";
import { externalIdsWithLaps, ingestActualRuns, type IncomingRun } from "@/lib/data/running";
import {
  downloadActivityFit,
  GarminAuthError,
  isGarminConfigured,
  listRunActivities,
  parseRunFit,
  toIncomingRun,
} from "@/lib/garmin";
import { addDays, todayInTimezone } from "@/lib/utils";

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
  fit_files: number;
  inserted: number;
  updated: number;
  skipped: number;
};

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
    const activities = await listRunActivities(since, today);
    const haveLaps = await externalIdsWithLaps(activities.map((a) => `garmin:${a.activityId}`));

    const runs: IncomingRun[] = [];
    let fitFiles = 0;
    for (const activity of activities) {
      let fit: ReturnType<typeof parseRunFit> | null = null;
      if (!haveLaps.has(`garmin:${activity.activityId}`)) {
        try {
          fit = parseRunFit(await downloadActivityFit(activity.activityId));
          fitFiles++;
        } catch (err) {
          if (err instanceof GarminAuthError) throw err;
          // Summary metrics still import; laps are retried next sync.
          console.error(`[garmin] FIT for ${activity.activityId} failed`, err);
        }
      }
      const run = toIncomingRun(activity, fit);
      if (run) runs.push(run);
    }

    const result = await ingestActualRuns("garmin", runs);
    await recordSync({ garmin_last_synced_at: new Date().toISOString(), garmin_last_error: null });
    return { runs_found: activities.length, fit_files: fitFiles, ...result };
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
