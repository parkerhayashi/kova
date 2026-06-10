import { mergeDailyTotals, scaleNutrients, type DailyTotals } from "@/lib/nutrition";
import { catalogNutrientsForName } from "@/lib/supplementCatalog";
import type { Supplement, SupplementLog } from "@/types";

/** Nutrients per the supplement's reference dose (default_dose or catalog dose). */
export function nutrientsForSupplement(
  supplement: Supplement,
): { baseDose: number; nutrients: DailyTotals } | null {
  const stored = supplement.nutrients;
  if (stored && Object.keys(stored).length > 0) {
    return {
      baseDose: supplement.default_dose ?? 1,
      nutrients: stored,
    };
  }

  const catalog = catalogNutrientsForName(supplement.name);
  if (!catalog) return null;

  return { baseDose: catalog.dose, nutrients: catalog.nutrients };
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
