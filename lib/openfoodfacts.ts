/**
 * Open Food Facts integration (blueprint §2) — barcode scanning for packaged
 * food. No API key required. Used by the PWA camera barcode scanner.
 */
import type { NutrientProfile } from "@/types";

const OFF_BASE = "https://world.openfoodfacts.org/api/v2";

interface OffProduct {
  product_name?: string;
  serving_quantity?: number;
  nutriments?: Record<string, number>;
}

/** Map Open Food Facts `nutriments` (per 100g) to Kova nutrient fields. */
const NUTRIENT_MAP: Record<string, keyof NutrientProfile["nutrients"]> = {
  "energy-kcal_100g": "calories",
  proteins_100g: "protein_g",
  carbohydrates_100g: "carbs_g",
  fat_100g: "fat_g",
  "saturated-fat_100g": "saturated_fat_g",
  "trans-fat_100g": "trans_fat_g",
  fiber_100g: "fiber_g",
  sugars_100g: "sugar_g",
  "added-sugars_100g": "added_sugar_g",
  cholesterol_100g: "cholesterol_mg",
  sodium_100g: "sodium_mg",
  potassium_100g: "potassium_mg",
  calcium_100g: "calcium_mg",
  iron_100g: "iron_mg",
  magnesium_100g: "magnesium_mg",
  zinc_100g: "zinc_mg",
};

/** Look up a product by barcode and normalize to a NutrientProfile. */
export async function getByBarcode(
  barcode: string,
): Promise<NutrientProfile | null> {
  const res = await fetch(`${OFF_BASE}/product/${barcode}.json`);
  if (!res.ok) throw new Error(`Open Food Facts failed: ${res.status}`);
  const json = await res.json();
  if (json.status !== 1 || !json.product) return null;

  const product: OffProduct = json.product;
  const nutrients: NutrientProfile["nutrients"] = {};
  for (const [offKey, field] of Object.entries(NUTRIENT_MAP)) {
    const val = product.nutriments?.[offKey];
    if (typeof val === "number") nutrients[field] = val;
  }

  return {
    food_id: barcode,
    source: "open_food_facts",
    name: product.product_name ?? "Unknown product",
    serving_size_g: product.serving_quantity ?? 100,
    nutrients,
  };
}
