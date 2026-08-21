import type { Habit } from "@/types";

/** Estimated kcal per standard drink (beer/wine/spirit average). */
export const CALORIES_PER_DRINK = 100;

/** Soft cap for the stepper / stored values. */
export const MAX_DRINKS = 20;

/** Day tags that support drink counts (alcohol for now). */
export function isDrinkQuantityHabit(habit: Pick<Habit, "name" | "kind">): boolean {
  return habit.kind === "track" && /alcohol/i.test(habit.name);
}

/**
 * Parse amount_tier into an exact drink count.
 * Accepts numeric strings ("3") and legacy buckets ("1-3", "4-6", "6+", "3-6").
 */
export function normalizeDrinkCount(
  value: string | number | null | undefined,
): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    return Math.min(MAX_DRINKS, Math.round(value));
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    if (n <= 0) return null;
    return Math.min(MAX_DRINKS, n);
  }

  // Legacy buckets → midpoint estimates
  switch (trimmed) {
    case "1-3":
      return 2;
    case "3-6":
    case "4-6":
      return 5;
    case "6+":
      return 8;
    default:
      return null;
  }
}

export function formatDrinkCount(
  value: string | number | null | undefined,
): string | null {
  const count = normalizeDrinkCount(value);
  if (count == null) return null;
  return count === 1 ? "1 drink" : `${count} drinks`;
}

/** Exact count for trend scatter plots (legacy buckets already midpoints). */
export function drinkCountNumeric(
  value: string | number | null | undefined,
): number | null {
  return normalizeDrinkCount(value);
}

export function drinkCountCalories(
  value: string | number | null | undefined,
): number {
  const count = normalizeDrinkCount(value);
  return count == null ? 0 : count * CALORIES_PER_DRINK;
}

/** Serialize a count for habit_logs.amount_tier. */
export function serializeDrinkCount(count: number | null): string | null {
  if (count == null || count <= 0) return null;
  return String(Math.min(MAX_DRINKS, Math.round(count)));
}

/** @deprecated Use normalizeDrinkCount — kept for older call sites during migrate. */
export function normalizeDrinkTier(
  tier: string | null | undefined,
): number | null {
  return normalizeDrinkCount(tier);
}

/** @deprecated Use drinkCountNumeric */
export function drinkTierNumeric(
  tier: string | null | undefined,
): number | null {
  return normalizeDrinkCount(tier);
}

/** @deprecated Use drinkCountCalories */
export function drinkTierCalories(tier: string | null | undefined): number {
  return drinkCountCalories(tier);
}

/** @deprecated Use formatDrinkCount */
export function formatDrinkTier(
  tier: string | number | null | undefined,
): string | null {
  return formatDrinkCount(tier);
}
