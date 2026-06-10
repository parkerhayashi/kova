import { readFileSync } from "fs";
import { join } from "path";
import type { NutrientProfile } from "@/types";

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

export function loadRestaurantCatalog(): RestaurantCatalog {
  if (catalogCache) return catalogCache;
  const raw = readFileSync(CATALOG_PATH, "utf8");
  catalogCache = JSON.parse(raw) as RestaurantCatalog;
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
