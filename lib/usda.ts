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
  dataType?: string;
  servingSize?: number;
  servingSizeUnit?: string;
}

interface UsdaFoodNutrient {
  nutrient?: { number: string };
  number?: string | number;
  nutrientNumber?: string | number;
  amount?: number;
  value?: number;
}

interface UsdaFoodDetail {
  description: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients: UsdaFoodNutrient[];
}

const DATA_TYPE_RANK: Record<string, number> = {
  Foundation: 0,
  "SR Legacy": 1,
  Branded: 2,
  Survey: 3,
};

function nutrientNumber(fn: UsdaFoodNutrient): string | null {
  const raw = fn.nutrient?.number ?? fn.number ?? fn.nutrientNumber;
  if (raw == null) return null;
  return String(raw);
}

function nutrientAmount(fn: UsdaFoodNutrient): number | null {
  const amount = fn.amount ?? fn.value;
  return amount != null && Number.isFinite(amount) ? amount : null;
}

export async function searchFoods(query: string): Promise<FoodSearchResult[]> {
  const params = new URLSearchParams({
    api_key: apiKey(),
    query,
    pageSize: "25",
    dataType: "Foundation,SR Legacy,Branded",
  });
  const res = await fetch(`${USDA_BASE}/foods/search?${params}`);
  if (res.status === 429) {
    throw new Error("USDA rate limit hit — add USDA_API_KEY to .env.local");
  }
  if (!res.ok) throw new Error(`USDA search failed: ${res.status}`);
  const json = await res.json();
  const foods: FoodSearchResult[] = json.foods ?? [];
  return foods.sort(
    (a, b) =>
      (DATA_TYPE_RANK[a.dataType ?? ""] ?? 99) -
      (DATA_TYPE_RANK[b.dataType ?? ""] ?? 99),
  );
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

/** Fetch one food and normalize it to a Kova NutrientProfile. */
export async function getFood(fdcId: number): Promise<NutrientProfile> {
  const params = new URLSearchParams({
    api_key: apiKey(),
    // Foundation foods 404 on default "full" format; abridged is faster and works.
    format: "abridged",
  });
  const res = await fetch(`${USDA_BASE}/food/${fdcId}?${params}`);
  if (res.status === 404) {
    throw new Error("Food not found — it may have been retired by USDA. Try another match.");
  }
  if (res.status === 429) {
    throw new Error("USDA rate limit hit — add USDA_API_KEY to .env.local");
  }
  if (!res.ok) throw new Error(`USDA food failed: ${res.status}`);
  const food: UsdaFoodDetail = await res.json();

  const nutrients: NutrientProfile["nutrients"] = {};
  for (const fn of food.foodNutrients ?? []) {
    const num = nutrientNumber(fn);
    const field = num ? NUTRIENT_MAP[num] : undefined;
    const amount = nutrientAmount(fn);
    if (field && amount != null) nutrients[field] = amount;
  }

  const servingSize =
    food.servingSize && food.servingSize > 0 ? food.servingSize : 100;

  return {
    food_id: String(fdcId),
    source: "usda",
    name: food.description,
    serving_size_g: servingSize,
    nutrients,
  };
}
