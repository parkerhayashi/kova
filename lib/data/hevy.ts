/**
 * Server-side Hevy sync + reads. Import only from Server Components / routes.
 */
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getTimezone } from "@/lib/data/oura";
import {
  fetchAllWorkouts,
  fetchWorkoutEventsSince,
  fetchWorkoutsSince,
  getWorkoutById,
  getWorkoutCount,
  isHevyConfigured,
  normalizeHevyWorkout,
  type HevyWorkoutEvent,
} from "@/lib/hevy";
import { addDays } from "@/lib/utils";
import {
  flattenHevyWorkouts,
  normalizeExerciseName,
  toHevyCoachWorkoutLog,
  type HevyCoachWorkoutLog,
} from "@/lib/lifting-unified";
import type { Workout } from "@/types";

export type HevySyncResult = {
  synced: number;
  deleted: number;
  mode: "all" | "recent" | "events";
  days: number | null;
  totalOnHevy: number | null;
};

const SYNC_ON_OPEN_THROTTLE_MS = 5 * 60 * 1000;
const DEFAULT_SYNC_DAYS = 90;
const UPSERT_BATCH = 100;
const EVENTS_OVERLAP_MS = 60 * 60 * 1000;

export function isHevyConnected(): boolean {
  return isHevyConfigured();
}

export async function getHevyLastSyncedAt(): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("hevy_last_synced_at")
    .limit(1)
    .maybeSingle();
  return (data as { hevy_last_synced_at?: string | null } | null)
    ?.hevy_last_synced_at ?? null;
}

async function countLocalHevyWorkouts(): Promise<number> {
  const db = createServiceClient();
  const { count } = await db
    .from("workouts")
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

async function markHevySynced(settingsId: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("user_settings")
    .update({ hevy_last_synced_at: new Date().toISOString() })
    .eq("id", settingsId);
}

async function upsertHevyRows(
  rows: ReturnType<typeof normalizeHevyWorkout>[],
): Promise<void> {
  if (rows.length === 0) return;
  const db = createServiceClient();
  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { error } = await db.from("workouts").upsert(batch, {
      onConflict: "hevy_id",
    });
    if (error) throw new Error(error.message);
  }
}

async function deleteHevyWorkouts(hevyIds: string[]): Promise<number> {
  if (hevyIds.length === 0) return 0;
  const db = createServiceClient();
  const { error } = await db.from("workouts").delete().in("hevy_id", hevyIds);
  if (error) throw new Error(error.message);
  return hevyIds.length;
}

function eventsSinceCursor(lastSyncedAt: string | null, fallbackDays: number): string {
  if (lastSyncedAt) {
    const ms = new Date(lastSyncedAt).getTime() - EVENTS_OVERLAP_MS;
    return new Date(ms).toISOString();
  }
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - fallbackDays);
  return d.toISOString();
}

async function resolveUpdatedWorkout(
  event: Extract<HevyWorkoutEvent, { type: "updated" }>,
): Promise<Extract<HevyWorkoutEvent, { type: "updated" }>["workout"]> {
  const workout = event.workout;
  if ((workout.exercises ?? []).length > 0) return workout;
  try {
    return await getWorkoutById(workout.id);
  } catch {
    return workout;
  }
}

async function applyHevyEvents(
  events: HevyWorkoutEvent[],
  timezone: string,
): Promise<{ synced: number; deleted: number }> {
  const upsertRows: ReturnType<typeof normalizeHevyWorkout>[] = [];
  const deleteIds: string[] = [];

  for (const event of events) {
    if (event.type === "deleted") {
      deleteIds.push(event.id);
      continue;
    }
    const workout = await resolveUpdatedWorkout(event);
    upsertRows.push(normalizeHevyWorkout(workout, timezone));
  }

  await upsertHevyRows(upsertRows);
  const deleted = await deleteHevyWorkouts(deleteIds);
  return { synced: upsertRows.length, deleted };
}

export async function listHevyWorkoutsSince(sinceDate: string): Promise<Workout[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("workouts")
    .select("*")
    .gte("date", sinceDate)
    .order("date", { ascending: false });
  return (data as Workout[]) ?? [];
}

export async function listAllHevyWorkouts(): Promise<Workout[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("workouts")
    .select("*")
    .order("date", { ascending: false });
  return (data as Workout[]) ?? [];
}

/** Compact top-set payload for syncing Hevy history into Coach. */
export async function getHevyCoachPayload(): Promise<HevyCoachWorkoutLog[]> {
  const workouts = await listAllHevyWorkouts();
  return workouts
    .map((workout) => toHevyCoachWorkoutLog(workout))
    .filter((row): row is HevyCoachWorkoutLog => row != null);
}

export async function listHevyWorkouts(limit = 20): Promise<Workout[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("workouts")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);
  return (data as Workout[]) ?? [];
}

export async function getLatestHevyWorkout(): Promise<Workout | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("workouts")
    .select("*")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Workout) ?? null;
}

export async function getHevyWorkoutForDate(date: string): Promise<Workout | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("workouts")
    .select("*")
    .eq("date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Workout) ?? null;
}

export type HevySyncOptions = {
  /** When true, import the full Hevy account history. */
  all?: boolean;
  /** Trailing window for page-based sync (ignored when `all` is true). */
  days?: number;
  /** Force delta sync via /workouts/events. */
  events?: boolean;
};

/**
 * Pull Hevy workouts into the `workouts` table (keyed by hevy_id).
 */
export async function syncHevy(
  options: HevySyncOptions | number = DEFAULT_SYNC_DAYS,
): Promise<HevySyncResult> {
  if (!isHevyConfigured()) {
    throw new Error("Hevy is not connected — set HEVY_API_KEY.");
  }

  const opts: HevySyncOptions =
    typeof options === "number" ? { days: options } : options;
  const all = opts.all === true;
  const days = all ? null : (opts.days ?? DEFAULT_SYNC_DAYS);

  const timezone = await getTimezone();
  const totalOnHevy = await getWorkoutCount();

  const db = createServiceClient();
  const { data: settings } = await db
    .from("user_settings")
    .select("id, hevy_last_synced_at")
    .limit(1)
    .maybeSingle();

  const localCount = await countLocalHevyWorkouts();
  const useEvents = !all && localCount > 0;

  let synced = 0;
  let deleted = 0;
  let mode: HevySyncResult["mode"] = "recent";

  if (all) {
    const remote = await fetchAllWorkouts();
    const rows = remote.map((w) => normalizeHevyWorkout(w, timezone));
    await upsertHevyRows(rows);
    synced = rows.length;
    mode = "all";
  } else if (useEvents) {
    const lastSynced = (settings as { hevy_last_synced_at?: string | null } | null)
      ?.hevy_last_synced_at ?? null;
    const since = eventsSinceCursor(lastSynced, days ?? DEFAULT_SYNC_DAYS);
    const events = await fetchWorkoutEventsSince(since);
    const result = await applyHevyEvents(events, timezone);
    synced = result.synced;
    deleted = result.deleted;
    mode = "events";

    if (synced === 0 && deleted === 0 && !lastSynced) {
      const remote = await fetchWorkoutsSince(
        addDays(
          new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
            new Date(),
          ),
          -(days! - 1),
        ),
        Math.max(50, Math.ceil(days! / 2)),
      );
      const rows = remote.map((w) => normalizeHevyWorkout(w, timezone));
      await upsertHevyRows(rows);
      synced = rows.length;
      mode = "recent";
    }
  } else {
    const remote = await fetchWorkoutsSince(
      addDays(
        new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
          new Date(),
        ),
        -(days! - 1),
      ),
      Math.max(50, Math.ceil(days! / 2)),
    );
    const rows = remote.map((w) => normalizeHevyWorkout(w, timezone));
    await upsertHevyRows(rows);
    synced = rows.length;
    mode = "recent";
  }

  if (settings) {
    await markHevySynced((settings as { id: string }).id);
  }

  return {
    synced,
    deleted,
    mode,
    days,
    totalOnHevy,
  };
}

/** Import or refresh a single workout (Hevy webhook / manual by id). */
export async function syncHevyWorkoutById(hevyId: string): Promise<{
  hevy_id: string;
  title: string | null;
  date: string;
}> {
  if (!isHevyConfigured()) {
    throw new Error("Hevy is not connected — set HEVY_API_KEY.");
  }

  const timezone = await getTimezone();
  const workout = await getWorkoutById(hevyId);
  const row = normalizeHevyWorkout(workout, timezone);
  await upsertHevyRows([row]);

  const db = createServiceClient();
  const { data: settings } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (settings) {
    await markHevySynced((settings as { id: string }).id);
  }

  return { hevy_id: hevyId, title: row.title, date: row.date };
}

/** Best-effort sync when the workouts or home page is opened. */
export async function maybeSyncHevyOnOpen(): Promise<void> {
  if (!isHevyConfigured()) return;

  const db = createServiceClient();
  const { data: settings } = await db
    .from("user_settings")
    .select("id, hevy_last_synced_at")
    .limit(1)
    .maybeSingle();
  if (!settings) return;

  const thresholdMs = Date.now() - SYNC_ON_OPEN_THROTTLE_MS;
  const lastSynced = (settings as { hevy_last_synced_at?: string | null })
    .hevy_last_synced_at;
  if (lastSynced && new Date(lastSynced).getTime() > thresholdMs) return;

  const localCount = await countLocalHevyWorkouts();
  const fullBackfill = localCount === 0;

  after(async () => {
    try {
      await syncHevy(
        fullBackfill ? { all: true } : { events: true, days: 30 },
      );
    } catch (err) {
      console.warn("[hevy] sync-on-open failed:", (err as Error).message);
    }
  });
}
