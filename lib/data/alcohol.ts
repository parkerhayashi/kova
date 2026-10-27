/**
 * Server-side data layer for alcohol_logs (one row per day, standard drinks).
 * Cleared days are stored as drinks = 0 rather than deleted — see schema.sql.
 * Import only from Server Components and Server Actions.
 */
import { clampDrinks } from "@/lib/alcohol-drinks";
import { createServiceClient } from "@/lib/supabase/server";
import { addDays, normalizeIsoDate, todayInTimezone } from "@/lib/utils";

/** Drinks per day (only days with ≥ 1 drink) over the last `sinceDays`. */
export async function getAlcoholDrinksByDay(
  sinceDays: number,
  timezone?: string,
): Promise<Map<string, number>> {
  const db = createServiceClient();
  const { data } = await db
    .from("alcohol_logs")
    .select("date, drinks")
    .gte("date", addDays(todayInTimezone(timezone), -sinceDays))
    .gt("drinks", 0);
  const map = new Map<string, number>();
  for (const row of (data as { date: string; drinks: number }[]) ?? []) {
    map.set(normalizeIsoDate(row.date) ?? row.date, row.drinks);
  }
  return map;
}

export async function getAlcoholDrinksForDate(date: string): Promise<number | null> {
  const day = normalizeIsoDate(date) ?? date;
  const db = createServiceClient();
  const { data } = await db
    .from("alcohol_logs")
    .select("drinks")
    .eq("date", day)
    .maybeSingle();
  return clampDrinks((data as { drinks: number } | null)?.drinks);
}

/** Set the day's drink count; null / 0 clears it (kept as a 0 row). */
export async function setAlcoholDrinks(
  date: string,
  drinks: number | null,
): Promise<void> {
  const day = normalizeIsoDate(date) ?? date;
  const db = createServiceClient();
  const { error } = await db.from("alcohol_logs").upsert(
    {
      date: day,
      drinks: clampDrinks(drinks) ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "date" },
  );
  if (error) throw new Error(error.message);
}
