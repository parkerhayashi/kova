import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getTimezone } from "@/lib/data/oura";
import { BODY_PARTS, currentSeverity, INJURY_TYPES } from "@/lib/injuries";
import { normalizeIsoDate, todayInTimezone } from "@/lib/utils";
import type { Injury, InjuryCheckin, InjurySide, InjuryStatus } from "@/types";

const day = (v: string) => normalizeIsoDate(v) ?? v;
const asInjury = (r: Injury): Injury => ({
  ...r,
  onset_date: day(r.onset_date),
  resolved_on: r.resolved_on ? day(r.resolved_on) : null,
  aggravators: r.aggravators ?? [],
  symptoms: r.symptoms ?? [],
});

export type InjuryView = {
  injury: Injury;
  checkins: InjuryCheckin[];
  /** Latest check-in, else severity at onset. */
  severity: number;
  checkedInToday: boolean;
};

/** Injuries with their check-ins, newest first. Resolved ones only when asked. */
export const getInjuries = cache(async function getInjuries(
  includeResolved = false,
): Promise<InjuryView[]> {
  const today = todayInTimezone(await getTimezone());
  const db = createServiceClient();
  let query = db.from("injuries").select("*").order("onset_date", { ascending: false });
  if (!includeResolved) query = query.neq("status", "resolved");
  const { data, error } = await query;
  // Injuries are additive — pages render without them if the table is missing.
  if (error) {
    console.error("[injuries] unavailable", error.message);
    return [];
  }
  const injuries = ((data as Injury[]) ?? []).map(asInjury);
  if (injuries.length === 0) return [];
  const { data: rows } = await db
    .from("injury_checkins")
    .select("*")
    .in("injury_id", injuries.map((i) => i.id))
    .order("date");
  const checkins = ((rows as InjuryCheckin[]) ?? []).map((c) => ({ ...c, date: day(c.date) }));
  return injuries.map((injury) => {
    const mine = checkins.filter((c) => c.injury_id === injury.id);
    return {
      injury,
      checkins: mine,
      severity: currentSeverity(injury, mine),
      checkedInToday: mine.some((c) => c.date === today),
    };
  });
});

/** Active / improving injuries (Recovery, Today card, plan). */
export const getActiveInjuries = () => getInjuries(false);

function clampSeverity(n: number): number {
  if (!Number.isFinite(n)) throw new Error("Severity must be a number from 0 to 10");
  return Math.max(0, Math.min(10, Math.round(n)));
}

export type InjuryInput = {
  id?: string;
  body_part: string;
  side: InjurySide;
  injury_type: string;
  severity: number;
  onset_date?: string;
  aggravators?: string[];
  symptoms?: string[];
  notes?: string | null;
};

export async function saveInjury(input: InjuryInput): Promise<Injury> {
  if (!BODY_PARTS.some((b) => b.key === input.body_part)) throw new Error("Pick a body part");
  if (!INJURY_TYPES.some((t) => t.key === input.injury_type)) throw new Error("Pick a type");
  if (!["left", "right", "both", "none"].includes(input.side)) throw new Error("Invalid side");
  const today = todayInTimezone(await getTimezone());
  const onset = input.onset_date ? normalizeIsoDate(input.onset_date) : today;
  if (!onset || onset > today) throw new Error("Onset date must be today or earlier");
  const row = {
    body_part: input.body_part,
    side: input.side,
    injury_type: input.injury_type,
    severity: clampSeverity(input.severity),
    onset_date: onset,
    aggravators: input.aggravators ?? [],
    symptoms: input.symptoms ?? [],
    notes: input.notes?.trim().slice(0, 500) || null,
    updated_at: new Date().toISOString(),
  };
  const db = createServiceClient();
  const { data, error } = input.id
    ? await db.from("injuries").update(row).eq("id", input.id).select("*").single()
    : await db.from("injuries").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return asInjury(data as Injury);
}

/**
 * Today's level for an injury (one per day; re-checking replaces it). A
 * lower level than onset marks it improving; 0 for three days in a row
 * resolves it.
 */
export async function checkInInjury(input: {
  injury_id: string;
  severity: number;
  date?: string;
  note?: string | null;
}): Promise<void> {
  const today = todayInTimezone(await getTimezone());
  const date = input.date ? normalizeIsoDate(input.date) : today;
  if (!date || date > today) throw new Error("Check-ins can't be in the future");
  const severity = clampSeverity(input.severity);
  const db = createServiceClient();
  const { data: injury, error: injuryError } = await db
    .from("injuries")
    .select("*")
    .eq("id", input.injury_id)
    .maybeSingle();
  if (injuryError || !injury) throw new Error("Injury not found");

  const { error } = await db.from("injury_checkins").upsert(
    { injury_id: input.injury_id, date, severity, note: input.note?.trim() || null },
    { onConflict: "injury_id,date" },
  );
  if (error) throw new Error(error.message);

  const { data: recent } = await db
    .from("injury_checkins")
    .select("severity")
    .eq("injury_id", input.injury_id)
    .order("date", { ascending: false })
    .limit(3);
  const last3 = ((recent as { severity: number }[]) ?? []).map((r) => r.severity);
  const status: InjuryStatus =
    last3.length === 3 && last3.every((s) => s === 0)
      ? "resolved"
      : severity < (injury as Injury).severity
        ? "improving"
        : "active";
  await setInjuryStatus(input.injury_id, status, status === "resolved" ? date : null);
}

export async function setInjuryStatus(
  id: string,
  status: InjuryStatus,
  resolvedOn: string | null = null,
): Promise<void> {
  const db = createServiceClient();
  const { error } = await db
    .from("injuries")
    .update({
      status,
      resolved_on: status === "resolved" ? resolvedOn ?? todayInTimezone(await getTimezone()) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteInjury(id: string): Promise<void> {
  const db = createServiceClient();
  const { error } = await db.from("injuries").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
