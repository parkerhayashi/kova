import { mergeDailyTotals, scaleNutrients, type DailyTotals } from "@/lib/nutrition";
import { catalogNutrientsForName } from "@/lib/supplementCatalog";
import type { Supplement, SupplementLog } from "@/types";

/** Nutrients per the supplement's catalog reference dose (or default_dose when custom). */
export function nutrientsForSupplement(
  supplement: Supplement,
): { baseDose: number; nutrients: DailyTotals } | null {
  const catalog = catalogNutrientsForName(supplement.name);
  const stored = supplement.nutrients;
  const hasStored = stored != null && Object.keys(stored).length > 0;

  const nutrients = hasStored
    ? { ...(catalog?.nutrients ?? {}), ...stored }
    : catalog?.nutrients;

  if (!nutrients || Object.keys(nutrients).length === 0) return null;

  // Catalog nutrients are defined per catalog dose (e.g. 1000 mg fish oil), not
  // necessarily the user's default_dose. Using default_dose as the reference
  // under-counts when they differ (2400 mg taken vs 1000 mg reference).
  const baseDose =
    catalog?.dose ??
    supplement.default_dose ??
    1;

  return { baseDose, nutrients };
}

function doseMultiplier(supplement: Supplement, log: SupplementLog, baseDose: number): number {
  const taken = log.dose_taken ?? supplement.default_dose ?? baseDose;
  if (baseDose <= 0) return 1;
  return taken / baseDose;
}

/** Sum nutrition from supplements marked taken on the given logs. */
export function sumTakenSupplements(
  supplements: Supplement[],
  logs: SupplementLog[],
): DailyTotals {
  const byId = new Map(supplements.map((s) => [s.id, s]));
  let totals: DailyTotals = {};

  for (const log of logs) {
    if (!log.taken) continue;
    const supplement = byId.get(log.supplement_id);
    if (!supplement) continue;

    const profile = nutrientsForSupplement(supplement);
    if (!profile) continue;

    const scaled = scaleNutrients(
      profile.nutrients,
      doseMultiplier(supplement, log, profile.baseDose),
    );
    totals = mergeDailyTotals(totals, scaled);
  }

  return totals;
}
