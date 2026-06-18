import type { DrinkTier, Habit } from "@/types";

export const DRINK_TIERS: { id: DrinkTier; label: string; short: string }[] = [
  { id: "1-3", label: "1–3 drinks", short: "1–3" },
  { id: "4-6", label: "4–6 drinks", short: "4–6" },
  { id: "6+", label: "6+ drinks", short: "6+" },
];

/** Estimated calories added to nutrition when an alcohol tier is logged. */
export const DRINK_TIER_CALORIES: Record<DrinkTier, number> = {
  "1-3": 200,
  "4-6": 500,
  "6+": 700,
};

/** Day tags that support drink-count buckets (alcohol for now). */
export function isDrinkQuantityHabit(habit: Pick<Habit, "name" | "kind">): boolean {
  return habit.kind === "track" && /alcohol/i.test(habit.name);
}

export function formatDrinkTier(
  tier: DrinkTier | string | null | undefined,
): string | null {
  const normalized = normalizeDrinkTier(tier);
  if (!normalized) return null;
  return DRINK_TIERS.find((t) => t.id === normalized)?.label ?? normalized;
}

/** Midpoint estimate for trend scatter plots. */
export function drinkTierNumeric(
  tier: DrinkTier | string | null | undefined,
): number | null {
  switch (normalizeDrinkTier(tier)) {
    case "1-3":
      return 2;
    case "4-6":
      return 5;
    case "6+":
      return 8;
    default:
      return null;
  }
}

export function normalizeDrinkTier(
  tier: string | null | undefined,
): DrinkTier | null {
  if (tier === "3-6") return "4-6";
  return isDrinkTier(tier) ? tier : null;
}

export function drinkTierCalories(tier: string | null | undefined): number {
  const normalized = normalizeDrinkTier(tier);
  return normalized ? DRINK_TIER_CALORIES[normalized] : 0;
}

export function isDrinkTier(value: string | null | undefined): value is DrinkTier {
  return value === "1-3" || value === "4-6" || value === "6+";
}
