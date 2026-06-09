/**
 * Server-side read helpers for Oura-sourced data. Single-user app with no
 * sign-in flow yet, so Server Components read through the service client. These
 * functions must only be imported from Server Components / route handlers —
 * never a client component (they touch SUPABASE_SERVICE_ROLE_KEY).
 */
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "@/lib/crypto";
import { DEFAULT_TIMEZONE } from "@/lib/utils";
import {
  computeSleepDebt,
  exchangeToken,
  fetchOuraData,
  groupHeartRateByDay,
  ouraFetchHeartRate,
  type OuraSleepRow,
} from "@/lib/oura";
import type {
  Activity,
  HeartRateDaily,
  OuraProfile,
  OuraWorkout,
  Readiness,
  Sleep,
  SleepPeriod,
  UserSettings,
} from "@/types";

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getUserSettings(): Promise<UserSettings | null> {
  const db = createServiceClient();
  const { data } = await db.from("user_settings").select("*").limit(1).maybeSingle();
  return (data as UserSettings) ?? null;
}

/**
 * The display timezone for clock times, auto-detected from the browser and
 * stored in user_settings. Falls back to Eastern before detection lands (or if
 * the column hasn't been migrated yet).
 */
export async function getTimezone(): Promise<string> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("timezone")
    .limit(1)
    .maybeSingle();
  return (data as { timezone?: string | null } | null)?.timezone ?? DEFAULT_TIMEZONE;
}

/**
 * Persist the auto-detected display timezone. No-ops when it already matches so
 * the common case (browser tz unchanged) writes nothing. Returns the stored
 * value, or null if the column hasn't been migrated yet.
 */
export async function setTimezone(timezone: string): Promise<string | null> {
  const db = createServiceClient();
  const { data: row } = await db
    .from("user_settings")
    .select("id, timezone")
    .limit(1)
    .maybeSingle();
  if (!row) return null;

  const current = (row as { timezone?: string | null }).timezone;
  if (current === timezone) return timezone;

  const { error } = await db
    .from("user_settings")
    .update({ timezone })
    .eq("id", (row as { id: string }).id);
  if (error) return null;
  return timezone;
}

export async function isOuraConnected(): Promise<boolean> {
  const settings = await getUserSettings();
  return Boolean(settings?.oura_refresh_token || settings?.oura_access_token);
}

async function latest<T>(table: string): Promise<T | null> {
  const db = createServiceClient();
  const { data } = await db
    .from(table)
    .select("*")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as T) ?? null;
}

async function history<T>(table: string, days: number): Promise<T[]> {
  const db = createServiceClient();
  const { data } = await db
    .from(table)
    .select("*")
    .gte("date", isoDaysAgo(days))
    .order("date", { ascending: true });
  return (data as T[]) ?? [];
}

export const getLatestSleep = () => latest<Sleep>("sleep");
export const getLatestReadiness = () => latest<Readiness>("readiness");
export const getLatestActivity = () => latest<Activity>("activity");

export const getSleepHistory = (days: number) => history<Sleep>("sleep", days);
export const getReadinessHistory = (days: number) =>
  history<Readiness>("readiness", days);
export const getActivityHistory = (days: number) =>
  history<Activity>("activity", days);

/** Detailed sleep periods (incl. hypnogram + intraday HR/HRV samples). */
export async function getSleepPeriodHistory(days: number): Promise<SleepPeriod[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("sleep_periods")
    .select("*")
    .gte("date", isoDaysAgo(days))
    .order("bedtime_start", { ascending: true });
  return (data as SleepPeriod[]) ?? [];
}

/** Most recent sleep period that is an actual session (has a duration). */
export async function getLatestSleepPeriod(): Promise<SleepPeriod | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("sleep_periods")
    .select("*")
    .not("total_sleep_duration", "is", null)
    .order("bedtime_start", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as SleepPeriod) ?? null;
}

/** All-day heart-rate samples for a given date (one JSON row). */
export async function getHeartRateDay(date: string): Promise<HeartRateDaily | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("heart_rate_daily")
    .select("*")
    .eq("date", date)
    .maybeSingle();
  return (data as HeartRateDaily) ?? null;
}

/** Most recent day that has all-day heart-rate samples. */
export async function getLatestHeartRateDay(): Promise<HeartRateDaily | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("heart_rate_daily")
    .select("*")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as HeartRateDaily) ?? null;
}

export async function getOuraProfile(): Promise<OuraProfile | null> {
  const db = createServiceClient();
  const { data } = await db.from("oura_profile").select("*").limit(1).maybeSingle();
  return (data as OuraProfile) ?? null;
}

export async function getOuraWorkouts(days: number): Promise<OuraWorkout[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("oura_workouts")
    .select("*")
    .gte("day", isoDaysAgo(days))
    .order("start_datetime", { ascending: false });
  return (data as OuraWorkout[]) ?? [];
}

export interface SyncResult {
  range: { start_date: string; end_date: string };
  synced: {
    sleep: number;
    readiness: number;
    activity: number;
    sleep_periods: number;
    workouts: number;
    sessions: number;
    tags: number;
    heart_rate_days: number;
  };
}

// Sync-on-open: pull a fresh window when the app is opened, but no more than
// once per throttle window. 30 days keeps the 14-day sleep-debt rolling sum
// accurate and costs the same number of Oura requests as a short window.
const SYNC_ON_OPEN_THROTTLE_MS = 5 * 60 * 1000;
const SYNC_ON_OPEN_DAYS = 30;

export async function getOuraLastSyncedAt(): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("oura_last_synced_at")
    .limit(1)
    .maybeSingle();
  return (data as { oura_last_synced_at?: string | null } | null)
    ?.oura_last_synced_at ?? null;
}

async function markOuraSynced(settingsId: string): Promise<void> {
  const db = createServiceClient();
  await db
    .from("user_settings")
    .update({ oura_last_synced_at: new Date().toISOString() })
    .eq("id", settingsId);
}

/**
 * Opportunistic Oura sync triggered when the dashboard is opened. The network
 * work is deferred with `after()` so it never blocks the page render. Uses
 * `oura_last_synced_at` for throttling so other settings writes don't block sync.
 */
export async function maybeSyncOuraOnOpen(): Promise<void> {
  const db = createServiceClient();
  const { data: settings } = await db
    .from("user_settings")
    .select("id, oura_access_token, oura_refresh_token, oura_last_synced_at")
    .limit(1)
    .maybeSingle();

  if (!settings) return;
  if (!settings.oura_access_token && !settings.oura_refresh_token) return;

  const thresholdMs = Date.now() - SYNC_ON_OPEN_THROTTLE_MS;
  const lastSynced = settings.oura_last_synced_at;
  if (lastSynced && new Date(lastSynced).getTime() > thresholdMs) return;

  after(async () => {
    try {
      await syncOura(SYNC_ON_OPEN_DAYS);
    } catch (err) {
      console.warn("[oura] sync-on-open failed:", (err as Error).message);
    }
  });
}

/**
 * Pull a trailing window of Oura data and upsert it into Supabase. Shared by
 * the daily cron route and the OAuth callback's initial backfill.
 *
 * Uses refresh-first token handling (no expiry column, short-lived access
 * tokens) and computes sleep debt natively before upserting.
 */
export async function syncOura(
  days: number,
  intradayDays = 2,
): Promise<SyncResult> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const range = { start_date: isoDate(start), end_date: isoDate(end) };

  const db = createServiceClient();
  const { data: settings } = await db
    .from("user_settings")
    .select("id, oura_access_token, oura_refresh_token, sleep_need_hours")
    .limit(1)
    .maybeSingle();

  if (!settings?.oura_access_token && !settings?.oura_refresh_token) {
    throw new Error("Oura is not connected.");
  }

  let accessToken: string;
  if (settings.oura_refresh_token) {
    const refreshed = await exchangeToken({
      grant_type: "refresh_token",
      refresh_token: decryptToken(settings.oura_refresh_token),
    });
    accessToken = refreshed.access_token;
    await db
      .from("user_settings")
      .update({
        oura_access_token: encryptToken(refreshed.access_token),
        oura_refresh_token: encryptToken(refreshed.refresh_token),
        updated_at: new Date().toISOString(),
      })
      .eq("id", settings.id);
  } else {
    accessToken = decryptToken(settings.oura_access_token!);
  }

  const data = await fetchOuraData(accessToken, range);

  // All-day heart rate is the only high-volume source, so it uses its own
  // (shorter) window and is non-fatal — a failure leaves prior days intact.
  let heartRateDays: { date: string; samples: unknown[] }[] = [];
  try {
    const intradayStart = new Date(
      Date.now() - intradayDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const samples = await ouraFetchHeartRate(accessToken, {
      start_datetime: intradayStart,
      end_datetime: new Date().toISOString(),
    });
    heartRateDays = groupHeartRateByDay(samples);
  } catch (err) {
    console.warn("[oura] heartrate fetch failed:", (err as Error).message);
  }

  const sleepNeed = settings.sleep_need_hours ?? 8;
  const debt = computeSleepDebt(data.sleep, sleepNeed);
  const sleepRows: (OuraSleepRow & { sleep_debt_seconds: number | null })[] =
    data.sleep.map((row) => ({
      ...row,
      sleep_debt_seconds: debt.get(row.date) ?? null,
    }));

  const errors: string[] = [];
  const upsert = async (
    table: string,
    rows: unknown[],
    onConflict = "date",
  ) => {
    if (rows.length === 0) return;
    const { error } = await db.from(table).upsert(rows, { onConflict });
    if (error) errors.push(`${table}: ${error.message}`);
  };

  await Promise.all([
    upsert("sleep", sleepRows),
    upsert("readiness", data.readiness),
    upsert("activity", data.activity),
    upsert("sleep_periods", data.sleepPeriods, "oura_id"),
    upsert("heart_rate_daily", heartRateDays),
    upsert("oura_workouts", data.workouts, "oura_id"),
    upsert("oura_sessions", data.sessions, "oura_id"),
    upsert("oura_tags", data.tags, "oura_id"),
  ]);

  // Profile/ring config is a single row with no natural conflict key.
  if (data.profile) {
    const { data: existing } = await db
      .from("oura_profile")
      .select("id")
      .limit(1)
      .maybeSingle();
    const payload = { ...data.profile, updated_at: new Date().toISOString() };
    const { error } = existing?.id
      ? await db.from("oura_profile").update(payload).eq("id", existing.id)
      : await db.from("oura_profile").insert(payload);
    if (error) errors.push(`oura_profile: ${error.message}`);
  }

  if (errors.length > 0) throw new Error(errors.join("; "));

  await markOuraSynced(settings.id);

  return {
    range,
    synced: {
      sleep: sleepRows.length,
      readiness: data.readiness.length,
      activity: data.activity.length,
      sleep_periods: data.sleepPeriods.length,
      workouts: data.workouts.length,
      sessions: data.sessions.length,
      tags: data.tags.length,
      heart_rate_days: heartRateDays.length,
    },
  };
}
