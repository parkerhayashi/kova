/**
 * Server-side Hevy sync + reads. Import only from Server Components / routes.
 */
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getTimezone } from "@/lib/data/oura";
import {
  fetchAllWorkouts,
  fetchWorkoutsSince,
  getWorkoutCount,
  isHevyConfigured,
  normalizeHevyWorkout,
} from "@/lib/hevy";
import { addDays } from "@/lib/utils";
import type { Workout } from "@/types";

export type HevySyncResult = {
  synced: number;
  mode: "all" | "recent";
  days: number | null;
  totalOnHevy: number | null;
};

const SYNC_ON_OPEN_THROTTLE_MS = 5 * 60 * 1000;
const DEFAULT_SYNC_DAYS = 90;
const UPSERT_BATCH = 100;

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

export async function listHevyWorkouts(limit = 20): Promise<Workout[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("workouts")
    .select("*")
    .order("date", { ascending: false })
    .limit(limit);
  return (data as Workout[]) ?? [];
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
  /** Trailing window for incremental sync (ignored when `all` is true). */
  days?: number;
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

  const remote = all
    ? await fetchAllWorkouts()
    : await fetchWorkoutsSince(
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

  const db = createServiceClient();
  const { data: settings } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (settings) {
    await markHevySynced((settings as { id: string }).id);
  }

  return {
    synced: rows.length,
    mode: all ? "all" : "recent",
    days,
    totalOnHevy,
  };
}

/** Best-effort sync when the workouts page is opened. */
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
      await syncHevy(fullBackfill ? { all: true } : { days: 30 });
    } catch (err) {
      console.warn("[hevy] sync-on-open failed:", (err as Error).message);
    }
  });
}
