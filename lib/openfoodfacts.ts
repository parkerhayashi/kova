/**
 * Open Food Facts integration — barcode lookup and text search for packaged
 * food. No API key required.
 */
import type { NutrientProfile } from "@/types";

const OFF_V2 = "https://world.openfoodfacts.org/api/v2";
const OFF_SEARCH = "https://world.openfoodfacts.org/cgi/search.pl";

const USER_AGENT = "Kova/1.0 (personal health dashboard)";

interface OffProduct {
  product_name?: string;
  brands?: string;
  serving_quantity?: number;
  nutriments?: Record<string, number>;
}

interface OffSearchProduct extends OffProduct {
  code?: string;
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

export interface OffSearchHit {
  code: string;
  name: string;
  brand: string | null;
  calories: number | null;
}

function normalizeProduct(
  code: string,
  product: OffProduct,
): NutrientProfile | null {
  const name = product.product_name?.trim();
  if (!name) return null;

  const nutrients: NutrientProfile["nutrients"] = {};
  for (const [offKey, field] of Object.entries(NUTRIENT_MAP)) {
    const val = product.nutriments?.[offKey];
    if (typeof val === "number") nutrients[field] = val;
  }

  return {
    food_id: code,
    source: "open_food_facts",
    name,
    serving_size_g: product.serving_quantity ?? 100,
    nutrients,
  };
}

/** Text search — returns popular packaged products matching the query. */
export async function searchProducts(
  query: string,
  pageSize = 15,
): Promise<OffSearchHit[]> {
  const params = new URLSearchParams({
    action: "process",
    json: "1",
    search_terms: query,
    page_size: String(pageSize),
    fields: "code,product_name,brands,nutriments,serving_quantity",
    sort_by: "unique_scans_n",
  });

  const res = await fetch(`${OFF_SEARCH}?${params}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Open Food Facts search failed: ${res.status}`);

  const json = (await res.json()) as { products?: OffSearchProduct[] };
  const hits: OffSearchHit[] = [];

  for (const raw of json.products ?? []) {
    const code = String(raw.code ?? "").trim();
    const name = raw.product_name?.trim();
    if (!code || !name) continue;

    hits.push({
      code,
      name,
      brand: raw.brands?.split(",")[0]?.trim() || null,
      calories:
        typeof raw.nutriments?.["energy-kcal_100g"] === "number"
          ? Math.round(raw.nutriments["energy-kcal_100g"])
          : null,
    });
  }

  return hits;
}

/** Look up a product by barcode and normalize to a NutrientProfile. */
export async function getByBarcode(
  barcode: string,
): Promise<NutrientProfile | null> {
  const res = await fetch(`${OFF_V2}/product/${barcode}.json`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Open Food Facts failed: ${res.status}`);
  const json = await res.json();
  if (json.status !== 1 || !json.product) return null;

  return normalizeProduct(barcode, json.product as OffProduct);
}
