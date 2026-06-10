#!/usr/bin/env node
/**
 * Import curated nutrition CSV/JSON from docs/nutrition/incoming/.
 *
 * Usage: npm run nutrition:import
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const INCOMING = join(ROOT, "docs/nutrition/incoming");
const REST_IN = join(INCOMING, "restaurants");
const DUKE_IN = join(INCOMING, "duke");
const CHAINS_OUT = join(ROOT, "data/restaurants/chains");
const DUKE_CURATED = join(ROOT, "data/duke-dining/curated.json");

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseCsv(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());
    const row = {};
    headers.forEach((h, j) => {
      row[h] = cols[j] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function num(val) {
  if (val === "" || val == null) return undefined;
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

function rowToItem(row, prefix) {
  const name = row.name?.trim();
  if (!name) return null;
  const id = row.id?.trim() || `${prefix}:${slugify(name)}`;
  const nutrients = {};
  for (const [key, val] of Object.entries(row)) {
    if (["name", "id", "servingSize", "serving_size_g", "category", "menu"].includes(key))
      continue;
    const n = num(val);
    if (n !== undefined) nutrients[key] = n;
  }
  return {
    id,
    name,
    category: row.category?.trim() || null,
    menu: row.menu?.trim() || null,
    servingSize: row.servingSize?.trim() || "1 serving",
    serving_size_g: num(row.serving_size_g) ?? 100,
    tags: [],
    nutrients,
  };
}

function loadMeta(dir, stem) {
  const metaPath = join(dir, `${stem}.meta.json`);
  if (existsSync(metaPath)) return JSON.parse(readFileSync(metaPath, "utf8"));
  return { id: slugify(stem), name: stem.replace(/-/g, " ") };
}

function importRestaurantFile(filePath) {
  const ext = filePath.endsWith(".json") ? "json" : "csv";
  const stem = basename(filePath).replace(/\.(csv|json)$/, "");
  const meta = loadMeta(dirname(filePath), stem);

  if (ext === "json") {
    const chain = JSON.parse(readFileSync(filePath, "utf8"));
    chain.id = chain.id ?? meta.id;
    chain.name = chain.name ?? meta.name;
    chain.source = chain.source ?? "manual import";
    chain.syncedAt = new Date().toISOString();
    writeFileSync(join(CHAINS_OUT, `${chain.id}.json`), JSON.stringify(chain, null, 2) + "\n");
    console.log(`  chain → data/restaurants/chains/${chain.id}.json (${chain.items?.length ?? 0} items)`);
    return;
  }

  const rows = parseCsv(readFileSync(filePath, "utf8"));
  const items = rows
    .map((r) => rowToItem(r, meta.id))
    .filter(Boolean);
  const chain = {
    id: meta.id,
    name: meta.name,
    source: "manual import",
    syncedAt: new Date().toISOString(),
    items,
  };
  writeFileSync(join(CHAINS_OUT, `${meta.id}.json`), JSON.stringify(chain, null, 2) + "\n");
  console.log(`  chain → data/restaurants/chains/${meta.id}.json (${items.length} items)`);
}

function importDukeFile(filePath) {
  const stem = basename(filePath).replace(/\.(csv|json)$/, "");
  const meta = loadMeta(dirname(filePath), stem);
  const locationId = meta.id;
  const locationName = meta.name;

  let items = [];
  if (filePath.endsWith(".json")) {
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    items = Array.isArray(data.items) ? data.items : data;
  } else {
    items = parseCsv(readFileSync(filePath, "utf8"))
      .map((r) => rowToItem(r, `duke:${locationId}`))
      .filter(Boolean)
      .map((item) => ({
        ...item,
        location: locationName,
        locationId,
      }));
  }

  for (const item of items) {
    item.id = item.id ?? `duke:${locationId}:${slugify(item.name)}`;
    item.location = item.location ?? locationName;
    item.locationId = item.locationId ?? locationId;
  }

  let curated = { syncedAt: new Date().toISOString(), source: "manual import", locations: [], items: [] };
  if (existsSync(DUKE_CURATED)) {
    curated = JSON.parse(readFileSync(DUKE_CURATED, "utf8"));
  }

  curated.items = curated.items.filter((i) => i.locationId !== locationId);
  curated.items.push(...items);
  curated.locations = curated.locations.filter((l) => l.id !== locationId);
  curated.locations.push({ id: locationId, name: locationName, itemCount: items.length });
  curated.syncedAt = new Date().toISOString();
  curated.source = "manual import";

  writeFileSync(DUKE_CURATED, JSON.stringify(curated, null, 2) + "\n");
  console.log(`  duke → data/duke-dining/curated.json (+${items.length} at ${locationName})`);
}

function importDir(dir, handler) {
  if (!existsSync(dir)) return 0;
  const files = readdirSync(dir).filter((f) => f.endsWith(".csv") || f.endsWith(".json"));
  for (const f of files) {
    if (f.endsWith(".meta.json")) continue;
    handler(join(dir, f));
  }
  return files.filter((f) => !f.endsWith(".meta.json")).length;
}

function main() {
  mkdirSync(REST_IN, { recursive: true });
  mkdirSync(DUKE_IN, { recursive: true });
  mkdirSync(CHAINS_OUT, { recursive: true });

  console.log("Importing nutrition from docs/nutrition/incoming/ …\n");

  const restCount = importDir(REST_IN, importRestaurantFile);
  const dukeCount = importDir(DUKE_IN, importDukeFile);

  if (restCount === 0 && dukeCount === 0) {
    console.error("Nothing to import. Drop CSV/JSON in docs/nutrition/incoming/");
    process.exit(1);
  }

  if (restCount > 0) {
    console.log("\nRun npm run restaurants:sync to merge chain files into catalog.json");
  }
  if (dukeCount > 0) {
    console.log("Duke curated catalog is live — curated.json replaces auto catalog when present.");
  }
}

main();
