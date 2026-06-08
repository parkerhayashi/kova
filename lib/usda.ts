/**
 * USDA FoodData Central integration (blueprint §2).
 * Keyword food search → a single lookup returns the full nutrition profile,
 * so no extra calls per nutrient. No API key required (DEMO_KEY works;
 * a free key raises rate limits — set USDA_API_KEY if you have one).
 *
 * Risk note (§12): not all entries have complete micronutrient data — map
 * missing nutrients to null and render "N/A" rather than skewing daily totals.
 */
import type { NutrientProfile } from "@/types";

const USDA_BASE = "https://api.nal.usda.gov/fdc/v1";

function apiKey() {
  return process.env.USDA_API_KEY || "DEMO_KEY";
}

export interface FoodSearchResult {
  fdcId: number;
  description: string;
  brandName?: string;
  servingSize?: number;
  servingSizeUnit?: string;
}

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const params = new URLSearchParams({
    api_key: apiKey(),
    query,
    pageSize: "25",
    dataType: "Foundation,SR Legacy,Branded",
  });
  const res = await fetch(`${USDA_BASE}/foods/search?${params}`);
  if (!res.ok) throw new Error(`USDA search failed: ${res.status}`);
  const json = await res.json();
  return json.foods ?? [];
}

/** USDA nutrient number → Kova Meal field. */
const NUTRIENT_MAP: Record<string, keyof NutrientProfile["nutrients"]> = {
  "208": "calories",
  "203": "protein_g",
  "205": "carbs_g",
  "204": "fat_g",
  "606": "saturated_fat_g",
  "605": "trans_fat_g",
  "291": "fiber_g",
  "269": "sugar_g",
  "601": "cholesterol_mg",
  "307": "sodium_mg",
  "306": "potassium_mg",
  "301": "calcium_mg",
  "303": "iron_mg",
  "304": "magnesium_mg",
  "309": "zinc_mg",
  "317": "selenium_mcg",
  "305": "phosphorus_mg",
  "320": "vitamin_a_mcg",
  "401": "vitamin_c_mg",
  "328": "vitamin_d_mcg",
  "323": "vitamin_e_mg",
  "430": "vitamin_k_mcg",
  "404": "vitamin_b1_mg",
  "405": "vitamin_b2_mg",
  "406": "vitamin_b3_mg",
  "410": "vitamin_b5_mg",
  "415": "vitamin_b6_mg",
  "417": "folate_mcg",
  "418": "vitamin_b12_mcg",
};

interface UsdaFoodDetail {
  description: string;
  servingSize?: number;
  foodNutrients: {
    nutrient: { number: string };
    amount: number;
  }[];
}

/** Fetch one food and normalize it to a Kova NutrientProfile. */
export async function getFood(fdcId: number): Promise<NutrientProfile> {
  const params = new URLSearchParams({ api_key: apiKey() });
  const res = await fetch(`${USDA_BASE}/food/${fdcId}?${params}`);
  if (!res.ok) throw new Error(`USDA food failed: ${res.status}`);
  const food: UsdaFoodDetail = await res.json();

  const nutrients: NutrientProfile["nutrients"] = {};
  for (const fn of food.foodNutrients ?? []) {
    const field = NUTRIENT_MAP[fn.nutrient?.number];
    if (field) nutrients[field] = fn.amount;
  }

  return {
    food_id: String(fdcId),
    source: "usda",
    name: food.description,
    serving_size_g: food.servingSize ?? 100,
    nutrients,
  };
}
