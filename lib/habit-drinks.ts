import type { DrinkTier, Habit } from "@/types";

export const DRINK_TIERS: { id: DrinkTier; label: string; short: string }[] = [
  { id: "1-3", label: "1–3 drinks", short: "1–3" },
  { id: "3-6", label: "3–6 drinks", short: "3–6" },
  { id: "6+", label: "6+ drinks", short: "6+" },
];

/** Day tags that support drink-count buckets (alcohol for now). */
export function isDrinkQuantityHabit(habit: Pick<Habit, "name" | "kind">): boolean {
  return habit.kind === "track" && /alcohol/i.test(habit.name);
}

export function formatDrinkTier(tier: DrinkTier | null | undefined): string | null {
  if (!tier) return null;
  return DRINK_TIERS.find((t) => t.id === tier)?.label ?? tier;
}

/** Midpoint estimate for trend scatter plots. */
export function drinkTierNumeric(tier: DrinkTier | null | undefined): number | null {
  switch (tier) {
    case "1-3":
      return 2;
    case "3-6":
      return 4;
    case "6+":
      return 8;
    default:
      return null;
  }
}

export function isDrinkTier(value: string | null | undefined): value is DrinkTier {
  return value === "1-3" || value === "3-6" || value === "6+";
}
