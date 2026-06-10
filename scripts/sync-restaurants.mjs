/**
 * Merge per-chain JSON files into data/restaurants/catalog.json.
 *
 * Usage:  npm run restaurants:sync
 *
 * Drop chain catalogs in data/restaurants/chains/*.json (see README there).
 * Individual scrapers can write those files; this script only merges.
 */

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CHAINS_DIR = join(ROOT, "data/restaurants/chains");
const OUT_PATH = join(ROOT, "data/restaurants/catalog.json");

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function loadChainFiles() {
  mkdirSync(CHAINS_DIR, { recursive: true });
  const files = readdirSync(CHAINS_DIR).filter(
    (f) => f.endsWith(".json") && f !== "catalog.json",
  );

  const chains = [];
  for (const file of files) {
    const raw = readFileSync(join(CHAINS_DIR, file), "utf8");
    const data = JSON.parse(raw);
    if (!data.id || !data.name || !Array.isArray(data.items)) {
      console.warn(`Skipping ${file}: needs id, name, items[]`);
      continue;
    }
    chains.push(data);
  }
  return chains;
}

function mergeCatalog(chains) {
  const restaurants = [];
  const items = [];
  const seenIds = new Set();

  for (const chain of chains) {
    const restaurantId = slugify(chain.id);
    let count = 0;

    for (const item of chain.items) {
      const id = item.id ?? `${restaurantId}:${slugify(item.name)}`;
      if (seenIds.has(id)) {
        console.warn(`Duplicate item id ${id} in ${chain.name}, skipping`);
        continue;
      }
      seenIds.add(id);

      items.push({
        ...item,
        id,
        restaurant: chain.name,
        restaurantId,
      });
      count++;
    }

    restaurants.push({
      id: restaurantId,
      name: chain.name,
      itemCount: count,
    });
  }

  restaurants.sort((a, b) => a.name.localeCompare(b.name));
  items.sort(
    (a, b) =>
      a.restaurant.localeCompare(b.restaurant) || a.name.localeCompare(b.name),
  );

  const sources = chains.map((c) => c.source ?? c.name).filter(Boolean);

  return {
    syncedAt: new Date().toISOString(),
    source: sources.length ? sources.join(" + ") : "data/restaurants/chains/*.json",
    restaurants,
    items,
  };
}

const chains = loadChainFiles();
const catalog = mergeCatalog(chains);
writeFileSync(OUT_PATH, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(
  `✓ Wrote ${catalog.items.length} items across ${catalog.restaurants.length} restaurant(s) → data/restaurants/catalog.json`,
);
