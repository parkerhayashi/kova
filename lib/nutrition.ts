import type { Meal, NutrientProfile } from "@/types";

export const DEFAULT_GOALS = {
  calories: 2000,
  protein_g: 150,
  carbs_g: 200,
  fat_g: 65,
  water_ml: 3000,
} as const;

export type NutritionGoals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  water_ml: number;
};

export type NutrientKey = keyof Omit<
  Meal,
  "id" | "date" | "meal_name" | "food_id" | "source" | "serving_size_g" | "servings" | "logged_at"
>;

export type DailyTotals = Partial<Record<NutrientKey, number>>;

/** Daily reference intakes for progress bars (adult defaults). */
export const MICRONUTRIENT_RDA: {
  key: NutrientKey;
  label: string;
  unit: string;
  target: number;
  /** When true, going over target is undesirable (e.g. sodium). */
  limit?: boolean;
}[] = [
  { key: "fiber_g", label: "Fiber", unit: "g", target: 28 },
  { key: "sugar_g", label: "Sugar", unit: "g", target: 50, limit: true },
  { key: "sodium_mg", label: "Sodium", unit: "mg", target: 2300, limit: true },
  { key: "potassium_mg", label: "Potassium", unit: "mg", target: 4700 },
  { key: "calcium_mg", label: "Calcium", unit: "mg", target: 1000 },
  { key: "iron_mg", label: "Iron", unit: "mg", target: 8 },
  { key: "magnesium_mg", label: "Magnesium", unit: "mg", target: 400 },
  { key: "zinc_mg", label: "Zinc", unit: "mg", target: 11 },
  { key: "vitamin_d_mcg", label: "Vitamin D", unit: "mcg", target: 20 },
  { key: "vitamin_c_mg", label: "Vitamin C", unit: "mg", target: 90 },
  { key: "folate_mcg", label: "Folate", unit: "mcg", target: 400 },
  { key: "vitamin_b12_mcg", label: "B12", unit: "mcg", target: 2.4 },
  { key: "omega3_g", label: "Omega-3", unit: "g", target: 1.6 },
  { key: "cholesterol_mg", label: "Cholesterol", unit: "mg", target: 300, limit: true },
];

const NUMERIC_MEAL_KEYS: NutrientKey[] = [
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

export function scaleNutrients(
  nutrients: NutrientProfile["nutrients"],
  factor: number,
): DailyTotals {
  const out: DailyTotals = {};
  for (const [key, value] of Object.entries(nutrients)) {
    if (typeof value === "number" && factor > 0) {
      out[key as NutrientKey] = Math.round(value * factor * 10) / 10;
    }
  }
  return out;
}

/** Map a food profile + servings into a meals-table row (without id/logged_at). */
export function buildMealRow(
  profile: NutrientProfile,
  date: string,
  servings: number,
  mealName?: string,
): Omit<Meal, "id" | "logged_at"> {
  const scaled = scaleNutrients(profile.nutrients, servings);
  const row: Record<string, unknown> = {
    date,
    meal_name: mealName?.trim() || profile.name,
    food_id: profile.food_id,
    source: profile.source,
    serving_size_g: profile.serving_size_g,
    servings,
  };
  for (const key of NUMERIC_MEAL_KEYS) {
    row[key] = scaled[key] ?? null;
  }
  return row as Omit<Meal, "id" | "logged_at">;
}

export function sumMeals(meals: Meal[]): DailyTotals {
  const totals: DailyTotals = {};
  for (const meal of meals) {
    for (const key of NUMERIC_MEAL_KEYS) {
      const v = meal[key];
      if (typeof v === "number") {
        totals[key] = Math.round(((totals[key] ?? 0) + v) * 10) / 10;
      }
    }
  }
  return totals;
}

export function macroCalories(totals: DailyTotals): {
  protein: number;
  carbs: number;
  fat: number;
} {
  return {
    protein: (totals.protein_g ?? 0) * 4,
    carbs: (totals.carbs_g ?? 0) * 4,
    fat: (totals.fat_g ?? 0) * 9,
  };
}

export function fmtNutrient(value: number | null | undefined, unit: string): string {
  if (value == null) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${unit}`;
}

export function progressPct(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((current / target) * 100));
}
