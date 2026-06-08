/**
 * Server-side read helpers for Oura-sourced data. Single-user app with no
 * sign-in flow yet, so Server Components read through the service client. These
 * functions must only be imported from Server Components / route handlers —
 * never a client component (they touch SUPABASE_SERVICE_ROLE_KEY).
 */
import { createServiceClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "@/lib/crypto";
import {
  computeSleepDebt,
  exchangeToken,
  fetchOuraData,
  type OuraSleepRow,
} from "@/lib/oura";
import type { Activity, Readiness, Sleep, UserSettings } from "@/types";

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

export interface SyncResult {
  range: { start_date: string; end_date: string };
  synced: { sleep: number; readiness: number; activity: number };
}

/**
 * Pull a trailing window of Oura data and upsert it into Supabase. Shared by
 * the daily cron route and the OAuth callback's initial backfill.
 *
 * Uses refresh-first token handling (no expiry column, short-lived access
 * tokens) and computes sleep debt natively before upserting.
 */
export async function syncOura(days: number): Promise<SyncResult> {
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

  const sleepNeed = settings.sleep_need_hours ?? 8;
  const debt = computeSleepDebt(data.sleep, sleepNeed);
  const sleepRows: (OuraSleepRow & { sleep_debt_seconds: number | null })[] =
    data.sleep.map((row) => ({
      ...row,
      sleep_debt_seconds: debt.get(row.date) ?? null,
    }));

  const errors: string[] = [];
  const upsert = async (table: string, rows: unknown[]) => {
    if (rows.length === 0) return;
    const { error } = await db.from(table).upsert(rows, { onConflict: "date" });
    if (error) errors.push(`${table}: ${error.message}`);
  };

  await Promise.all([
    upsert("sleep", sleepRows),
    upsert("readiness", data.readiness),
    upsert("activity", data.activity),
  ]);

  if (errors.length > 0) throw new Error(errors.join("; "));

  return {
    range,
    synced: {
      sleep: sleepRows.length,
      readiness: data.readiness.length,
      activity: data.activity.length,
    },
  };
}
