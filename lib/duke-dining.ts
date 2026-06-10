import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { parseNutrientAmount, parseServingSizeG, slugify } from "@/lib/netnutrition";
import type { NutrientProfile } from "@/types";

function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function applyItemOverrides<T extends { id: string; nutrients: NutrientProfile["nutrients"] }>(
  items: T[],
  overrides: Record<string, Partial<T>>,
): T[] {
  return items.map((item) => {
    const patch = overrides[item.id];
    if (!patch) return item;
    return {
      ...item,
      ...patch,
      nutrients: patch.nutrients
        ? { ...item.nutrients, ...patch.nutrients }
        : item.nutrients,
    };
  });
}

export interface DukeDiningItem {
  id: string;
  name: string;
  location: string;
  locationId: string;
  category: string | null;
  menu: string | null;
  servingSize: string;
  serving_size_g: number;
  tags: string[];
  nutrients: NutrientProfile["nutrients"];
  ingredients?: string;
}

export interface DukeDiningLocation {
  id: string;
  name: string;
  itemCount: number;
}

export interface DukeDiningCatalog {
  syncedAt: string;
  source: string;
  locations: DukeDiningLocation[];
  items: DukeDiningItem[];
}

let catalogCache: DukeDiningCatalog | null = null;

const CATALOG_PATH = join(process.cwd(), "data/duke-dining/catalog.json");
const CURATED_PATH = join(process.cwd(), "data/duke-dining/curated.json");
const OVERRIDES_PATH = join(process.cwd(), "data/duke-dining/overrides.json");

export function loadDukeCatalog(): DukeDiningCatalog {
  if (catalogCache) return catalogCache;
  const path = existsSync(CURATED_PATH) ? CURATED_PATH : CATALOG_PATH;
  let catalog = JSON.parse(readFileSync(path, "utf8")) as DukeDiningCatalog;

  const overrides = loadJson<Record<string, Partial<DukeDiningItem>>>(OVERRIDES_PATH, {});
  catalog = {
    ...catalog,
    items: applyItemOverrides(catalog.items, overrides),
  };

  catalogCache = catalog;
  return catalogCache;
}

export function searchDukeCatalog(
  query: string,
  locationId?: string,
  limit = 40,
): DukeDiningItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const catalog = loadDukeCatalog();
  const hits: { item: DukeDiningItem; score: number }[] = [];

  for (const item of catalog.items) {
    if (locationId && item.locationId !== locationId) continue;
    const name = item.name.toLowerCase();
    const loc = item.location.toLowerCase();
    const cat = (item.category ?? "").toLowerCase();

    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (cat.includes(q)) score = 40;
    else if (loc.includes(q)) score = 20;
    else continue;

    hits.push({ item, score });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((h) => h.item);
}

export function getDukeItem(itemId: string): DukeDiningItem | null {
  const catalog = loadDukeCatalog();
  return catalog.items.find((i) => i.id === itemId) ?? null;
}

export function dukeItemToProfile(item: DukeDiningItem): NutrientProfile {
  return {
    food_id: item.id,
    source: "duke_dining",
    name: `${item.name} · ${item.location}`,
    serving_size_g: item.serving_size_g,
    nutrients: item.nutrients,
  };
}

/** Convert food-devil scrape shape into catalog items (legacy chain locations). */
export function foodDevilLocationToItems(
  locationName: string,
  data: Record<string, unknown>,
): DukeDiningItem[] {
  const locationId = slugify(locationName);
  const items: DukeDiningItem[] = [];

  function walk(node: Record<string, unknown>, menu: string | null, category: string | null) {
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, string>;
      if ("calories" in v && "protein" in v) {
        const servingSize = v.serving_size ?? "1 serving";
        const nutrients: NutrientProfile["nutrients"] = {
          calories: parseNutrientAmount(v.calories) ?? undefined,
          protein_g: parseNutrientAmount(v.protein) ?? undefined,
          carbs_g: parseNutrientAmount(v.carb) ?? undefined,
          fat_g: parseNutrientAmount(v.total_fat) ?? undefined,
          saturated_fat_g: parseNutrientAmount(v.saturated_fat) ?? undefined,
          trans_fat_g: parseNutrientAmount(v.trans_fat) ?? undefined,
          cholesterol_mg: parseNutrientAmount(v.chloestrol ?? v.cholesterol) ?? undefined,
          sodium_mg: parseNutrientAmount(v.sodium) ?? undefined,
          fiber_g: parseNutrientAmount(v.fiber) ?? undefined,
          sugar_g: parseNutrientAmount(v.sugar) ?? undefined,
        };
        const id = `duke:legacy:${locationId}:${slugify(key)}`;
        items.push({
          id,
          name: key,
          location: locationName,
          locationId,
          category,
          menu,
          servingSize,
          serving_size_g: parseServingSizeG(servingSize),
          tags: [],
          nutrients,
          ingredients: v.ingredients,
        });
      } else {
        walk(v as Record<string, unknown>, menu, key);
      }
    }
  }

  for (const [menuKey, menuVal] of Object.entries(data)) {
    if (menuKey === "all_items") {
      walk(menuVal as Record<string, unknown>, null, null);
    } else if (menuVal && typeof menuVal === "object") {
      walk(menuVal as Record<string, unknown>, menuKey, null);
    }
  }

  return items;
}
