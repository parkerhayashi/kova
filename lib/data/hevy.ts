/**
 * Server-side Hevy sync + reads. Import only from Server Components / routes.
 */
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getTimezone } from "@/lib/data/oura";
import {
  fetchWorkoutsSince,
  isHevyConfigured,
  normalizeHevyWorkout,
} from "@/lib/hevy";
import { addDays } from "@/lib/utils";
import type { Workout } from "@/types";

export type HevySyncResult = {
  synced: number;
  days: number;
};

const SYNC_ON_OPEN_THROTTLE_MS = 5 * 60 * 1000;
const DEFAULT_SYNC_DAYS = 90;

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

async function markHevySynced(settingsId: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("user_settings")
    .update({ hevy_last_synced_at: new Date().toISOString() })
    .eq("id", settingsId);
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

/**
 * Pull Hevy workouts into the `workouts` table (keyed by hevy_id).
 */
export async function syncHevy(days = DEFAULT_SYNC_DAYS): Promise<HevySyncResult> {
  if (!isHevyConfigured()) {
    throw new Error("Hevy is not connected — set HEVY_API_KEY.");
  }

  const timezone = await getTimezone();
  const since = addDays(
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date()),
    -(days - 1),
  );

  const remote = await fetchWorkoutsSince(since);
  const rows = remote.map((w) => normalizeHevyWorkout(w, timezone));

  const db = createServiceClient();
  if (rows.length > 0) {
    const { error } = await db.from("workouts").upsert(rows, {
      onConflict: "hevy_id",
    });
    if (error) throw new Error(error.message);
  }

  const { data: settings } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();
  if (settings) {
    await markHevySynced((settings as { id: string }).id);
  }

  return { synced: rows.length, days };
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

  after(async () => {
    try {
      await syncHevy(30);
    } catch (err) {
      console.warn("[hevy] sync-on-open failed:", (err as Error).message);
    }
  });
}
