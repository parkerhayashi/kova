/**
 * Server-side data layer for manual tracking (blueprint Phase 3): weight,
 * habits, and supplements. Single-user app with no sign-in yet, so these read
 * and write through the service client. Import only from Server Components and
 * Server Actions — never a client component.
 */
import { createServiceClient } from "@/lib/supabase/server";
import { catalogNutrientsForName } from "@/lib/supplementCatalog";
import { addDays, normalizeIsoDate, todayInTimezone } from "@/lib/utils";
import type {
  Habit,
  HabitKind,
  HabitLog,
  Supplement,
  SupplementLog,
  WeightLog,
} from "@/types";

function asWeightLog(row: WeightLog): WeightLog {
  const date = normalizeIsoDate(row.date) ?? row.date;
  return { ...row, date };
}

function catalogNutrientsPayload(name: string): Record<string, number> | null {
  const match = catalogNutrientsForName(name);
  return match?.nutrients ?? null;
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------
export async function getWeightLogs(days: number): Promise<WeightLog[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("weight_log")
    .select("*")
    .gte("date", addDays(todayInTimezone(), -days))
    .order("date", { ascending: true });
  return ((data as WeightLog[]) ?? []).map(asWeightLog);
}

export async function getLatestWeight(): Promise<WeightLog | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("weight_log")
    .select("*")
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? asWeightLog(data as WeightLog) : null;
}

export async function getWeightForDate(date: string): Promise<WeightLog | null> {
  const day = normalizeIsoDate(date);
  if (!day) return null;
  const db = createServiceClient();
  const { data } = await db
    .from("weight_log")
    .select("*")
    .eq("date", day)
    .maybeSingle();
  return data ? asWeightLog(data as WeightLog) : null;
}

export async function upsertWeight(input: {
  date: string;
  weight_lbs: number;
  body_fat_pct: number | null;
  notes: string | null;
}): Promise<void> {
  const day = normalizeIsoDate(input.date);
  if (!day) throw new Error(`Invalid weight date: ${input.date}`);
  const db = createServiceClient();
  const { error } = await db.from("weight_log").upsert(
    { ...input, date: day },
    { onConflict: "date" },
  );
  if (error) throw new Error(error.message);
}

export async function deleteWeight(date: string): Promise<void> {
  const day = normalizeIsoDate(date);
  if (!day) throw new Error(`Invalid weight date: ${date}`);
  const db = createServiceClient();
  const { error } = await db.from("weight_log").delete().eq("date", day);
  if (error) throw new Error(error.message);
}

export async function getAllWeightLogs(): Promise<WeightLog[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("weight_log")
    .select("*")
    .order("date", { ascending: true });
  return ((data as WeightLog[]) ?? []).map(asWeightLog);
}

// ---------------------------------------------------------------------------
// Habits
// ---------------------------------------------------------------------------
export async function getHabits(activeOnly = true): Promise<Habit[]> {
  const db = createServiceClient();
  let query = db
    .from("habits")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  return ((data as Habit[]) ?? []).map((h) => ({
    ...h,
    kind: h.kind ?? "positive",
  }));
}

export async function getHabitLogs(
  sinceDays: number,
  timezone?: string,
): Promise<HabitLog[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("habit_logs")
    .select("*")
    .gte("date", addDays(todayInTimezone(timezone), -sinceDays));
  return (data as HabitLog[]) ?? [];
}

export async function getHabitLogsForDate(date: string): Promise<HabitLog[]> {
  const db = createServiceClient();
  const { data } = await db.from("habit_logs").select("*").eq("date", date);
  return (data as HabitLog[]) ?? [];
}

export async function setHabitCompletion(
  habitId: string,
  date: string,
  completed: boolean,
  amountTier?: string | null,
): Promise<void> {
  const db = createServiceClient();
  const row: Record<string, unknown> = {
    habit_id: habitId,
    date,
    completed,
    amount_tier: completed && amountTier ? amountTier : null,
  };
  await db
    .from("habit_logs")
    .upsert(row, { onConflict: "habit_id,date" });
}

async function nextSortOrder(table: "habits" | "supplements"): Promise<number> {
  const db = createServiceClient();
  const { data } = await db
    .from(table)
    .select("sort_order")
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { sort_order: number } | null)?.sort_order ?? -1) + 1;
}

export async function addHabit(
  name: string,
  kind: HabitKind = "positive",
): Promise<void> {
  const db = createServiceClient();
  await db.from("habits").insert({
    name,
    kind,
    sort_order: await nextSortOrder("habits"),
  });
}

export async function updateHabit(
  id: string,
  fields: Partial<Pick<Habit, "name" | "kind" | "is_active" | "sort_order">>,
): Promise<void> {
  const db = createServiceClient();
  await db.from("habits").update(fields).eq("id", id);
}

export async function deleteHabit(id: string): Promise<void> {
  const db = createServiceClient();
  await db.from("habits").delete().eq("id", id);
}

// ---------------------------------------------------------------------------
// Supplements
// ---------------------------------------------------------------------------
export async function getSupplements(activeOnly = true): Promise<Supplement[]> {
  const db = createServiceClient();
  let query = db
    .from("supplements")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (activeOnly) query = query.eq("is_active", true);
  const { data } = await query;
  const supplements = (data as Supplement[]) ?? [];

  // Backfill catalog nutrients for rows created before the nutrients column existed.
  await Promise.all(
    supplements.map(async (supplement) => {
      const hasStored =
        supplement.nutrients != null && Object.keys(supplement.nutrients).length > 0;
      if (hasStored) return;
      const nutrients = catalogNutrientsPayload(supplement.name);
      if (!nutrients) return;
      supplement.nutrients = nutrients;
      await db.from("supplements").update({ nutrients }).eq("id", supplement.id);
    }),
  );

  return supplements;
}

export async function getSupplementLogs(
  sinceDays: number,
  timezone?: string,
): Promise<SupplementLog[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("supplement_logs")
    .select("*")
    .gte("date", addDays(todayInTimezone(timezone), -sinceDays));
  return (data as SupplementLog[]) ?? [];
}

export async function getSupplementLogsForDate(date: string): Promise<SupplementLog[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("supplement_logs")
    .select("*")
    .eq("date", date)
    .eq("taken", true);
  return (data as SupplementLog[]) ?? [];
}

export async function getSupplementLogsSince(startDate: string): Promise<SupplementLog[]> {
  const db = createServiceClient();
  const { data } = await db
    .from("supplement_logs")
    .select("*")
    .gte("date", startDate)
    .eq("taken", true);
  return (data as SupplementLog[]) ?? [];
}

export async function setSupplementTaken(input: {
  supplementId: string;
  date: string;
  taken: boolean;
  dose_taken?: number | null;
  time_taken?: string | null;
  notes?: string | null;
}): Promise<void> {
  const db = createServiceClient();
  const row: Record<string, unknown> = {
    supplement_id: input.supplementId,
    date: input.date,
    taken: input.taken,
  };
  if (input.dose_taken !== undefined) row.dose_taken = input.dose_taken;
  if (input.time_taken !== undefined) row.time_taken = input.time_taken;
  if (input.notes !== undefined) row.notes = input.notes;
  await db
    .from("supplement_logs")
    .upsert(row, { onConflict: "supplement_id,date" });
}

export async function addSupplement(input: {
  name: string;
  default_dose: number | null;
  unit: string | null;
  notes: string | null;
  nutrients?: Record<string, number> | null;
}): Promise<void> {
  const db = createServiceClient();
  await db.from("supplements").insert({
    ...input,
    nutrients: input.nutrients ?? null,
    sort_order: await nextSortOrder("supplements"),
  });
}

export async function updateSupplement(
  id: string,
  fields: Partial<
    Pick<
      Supplement,
      | "name"
      | "default_dose"
      | "unit"
      | "notes"
      | "nutrients"
      | "is_active"
      | "sort_order"
    >
  >,
): Promise<void> {
  const db = createServiceClient();
  await db.from("supplements").update(fields).eq("id", id);
}

export async function deleteSupplement(id: string): Promise<void> {
  const db = createServiceClient();
  await db.from("supplements").delete().eq("id", id);
}
