/** Estimated kcal per standard drink (beer/wine/spirit average). */
export const CALORIES_PER_DRINK = 100;

/** Soft cap for the stepper / stored values (matches the DB check). */
export const MAX_DRINKS = 20;

/** Clamp a drink count to 1…MAX_DRINKS; anything ≤ 0 means "none logged". */
export function clampDrinks(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return Math.min(MAX_DRINKS, Math.round(value));
}

export function drinkCalories(drinks: number | null | undefined): number {
  return (clampDrinks(drinks) ?? 0) * CALORIES_PER_DRINK;
}

export function formatDrinkCount(drinks: number | null | undefined): string | null {
  const count = clampDrinks(drinks);
  if (count == null) return null;
  return count === 1 ? "1 drink" : `${count} drinks`;
}
