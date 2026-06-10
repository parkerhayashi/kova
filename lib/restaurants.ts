import { existsSync, readFileSync } from "fs";
import { join } from "path";
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

export interface RestaurantItem {
  id: string;
  name: string;
  restaurant: string;
  restaurantId: string;
  category: string | null;
  menu: string | null;
  servingSize: string;
  serving_size_g: number;
  tags: string[];
  nutrients: NutrientProfile["nutrients"];
  ingredients?: string;
}

export interface Restaurant {
  id: string;
  name: string;
  itemCount: number;
}

export interface RestaurantCatalog {
  syncedAt: string;
  source: string;
  restaurants: Restaurant[];
  items: RestaurantItem[];
}

let catalogCache: RestaurantCatalog | null = null;

const CATALOG_PATH = join(process.cwd(), "data/restaurants/catalog.json");
const OVERRIDES_PATH = join(process.cwd(), "data/restaurants/overrides.json");
const ALLOWLIST_PATH = join(process.cwd(), "data/restaurants/allowlist.json");

export function loadRestaurantCatalog(): RestaurantCatalog {
  if (catalogCache) return catalogCache;
  const raw = readFileSync(CATALOG_PATH, "utf8");
  let catalog = JSON.parse(raw) as RestaurantCatalog;

  const allowlist = loadJson<string[] | null>(ALLOWLIST_PATH, null);
  if (allowlist?.length) {
    const allowed = new Set(allowlist);
    catalog = {
      ...catalog,
      restaurants: catalog.restaurants.filter((r) => allowed.has(r.id)),
      items: catalog.items.filter((i) => allowed.has(i.restaurantId)),
    };
  }

  const overrides = loadJson<Record<string, Partial<RestaurantItem>>>(OVERRIDES_PATH, {});
  catalog = {
    ...catalog,
    items: applyItemOverrides(catalog.items, overrides),
  };

  catalogCache = catalog;
  return catalogCache;
}

export function searchRestaurantCatalog(
  query: string,
  restaurantId?: string,
  limit = 40,
): RestaurantItem[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const catalog = loadRestaurantCatalog();
  const hits: { item: RestaurantItem; score: number }[] = [];

  for (const item of catalog.items) {
    if (restaurantId && item.restaurantId !== restaurantId) continue;
    const name = item.name.toLowerCase();
    const restaurant = item.restaurant.toLowerCase();
    const cat = (item.category ?? "").toLowerCase();

    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 80;
    else if (name.includes(q)) score = 60;
    else if (cat.includes(q)) score = 40;
    else if (restaurant.includes(q)) score = 20;
    else continue;

    hits.push({ item, score });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((h) => h.item);
}

export function getRestaurantItem(itemId: string): RestaurantItem | null {
  const catalog = loadRestaurantCatalog();
  return catalog.items.find((i) => i.id === itemId) ?? null;
}

export function restaurantItemToProfile(item: RestaurantItem): NutrientProfile {
  return {
    food_id: item.id,
    source: "restaurant",
    name: `${item.name} · ${item.restaurant}`,
    serving_size_g: item.serving_size_g,
    nutrients: item.nutrients,
  };
}
