import type { DailyTotals, NutrientKey } from "@/lib/nutrition";
import { scaleNutrients } from "@/lib/nutrition";
import type { NutrientProfile, SavedMealComponent } from "@/types";

const NUMERIC_KEYS: NutrientKey[] = [
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "saturated_fat_g",
  "trans_fat_g",
  "fiber_g",
  "sugar_g",
  "added_sugar_g",
  "cholesterol_mg",
  "sodium_mg",
  "potassium_mg",
  "calcium_mg",
  "iron_mg",
  "magnesium_mg",
  "zinc_mg",
  "selenium_mcg",
  "phosphorus_mg",
  "vitamin_a_mcg",
  "vitamin_c_mg",
  "vitamin_d_mcg",
  "vitamin_e_mg",
  "vitamin_k_mcg",
  "vitamin_b1_mg",
  "vitamin_b2_mg",
  "vitamin_b3_mg",
  "vitamin_b5_mg",
  "vitamin_b6_mg",
  "folate_mcg",
  "vitamin_b12_mcg",
  "omega3_g",
  "omega6_g",
  "monounsaturated_fat_g",
  "polyunsaturated_fat_g",
];

export function sumSavedMealComponents(
  components: SavedMealComponent[],
): DailyTotals {
  const totals: DailyTotals = {};
  for (const component of components) {
    const scaled = scaleNutrients(component.nutrients, component.servings);
    for (const key of NUMERIC_KEYS) {
      const v = scaled[key];
      if (typeof v === "number") {
        totals[key] = Math.round(((totals[key] ?? 0) + v) * 10) / 10;
      }
    }
  }
  return totals;
}

export function profileToComponent(
  profile: NutrientProfile,
  servings: number,
): SavedMealComponent {
  return {
    name: profile.name,
    source: profile.source,
    food_id: profile.food_id,
    serving_size_g: profile.serving_size_g,
    servings,
    nutrients: profile.nutrients,
  };
}

export function savedMealTotalsLabel(components: SavedMealComponent[]): string {
  const totals = sumSavedMealComponents(components);
  const parts: string[] = [];
  if (totals.calories != null) parts.push(`${Math.round(totals.calories)} kcal`);
  if (totals.protein_g != null) parts.push(`${Math.round(totals.protein_g)}g P`);
  if (totals.carbs_g != null) parts.push(`${Math.round(totals.carbs_g)}g C`);
  if (totals.fat_g != null) parts.push(`${Math.round(totals.fat_g)}g F`);
  return parts.join(" · ") || "—";
}
