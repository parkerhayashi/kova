import { readFileSync } from "fs";
import { join } from "path";
import { makeItem, ROOT, writeChain } from "./_shared.mjs";

const CHAIN_ID = "chick-fil-a";
const SOURCE = "chick-fil-a.com/nutrition-allergens";

function decodeHtml(text) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&#174;/g, "®")
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function parseNumber(value) {
  const cleaned = value.replace(/,/g, "").trim();
  if (!cleaned || cleaned === "—") return null;
  if (cleaned.startsWith("<")) return 0;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseRow(row) {
  const title = row.match(/context\.menu_item\.title">([^<]+)/)?.[1];
  if (!title) return null;

  const values = [...row.matchAll(/inert\s*>\s*([^<]+?)\s*<\/span>/g)]
    .map((m) => m[1].trim())
    .filter((v) => v && v !== "✓");
  if (values.length < 11) return null;

  const servingSize = values[0];
  const servingG = Number.parseFloat(servingSize) || 100;
  const nums = values.slice(1, 11).map(parseNumber);
  if (nums.some((n) => n === null)) return null;

  return makeItem({
    chainId: CHAIN_ID,
    name: decodeHtml(title),
    category: "Menu",
    servingSize,
    servingSizeG: servingG,
    nutrients: {
      calories: nums[0],
      fat_g: nums[1],
      saturated_fat_g: nums[2],
      trans_fat_g: nums[3],
      cholesterol_mg: nums[4],
      sodium_mg: nums[5],
      carbs_g: nums[6],
      fiber_g: nums[7],
      sugar_g: nums[8],
      protein_g: nums[9],
    },
  });
}

function extractTables(html) {
  const starts = [...html.matchAll(/<table id="([^"]+)"/g)].map((m) => ({
    category: decodeHtml(m[1]),
    index: m.index,
  }));

  return starts.map((start, i) => ({
    category: start.category,
    body: html.slice(start.index, starts[i + 1]?.index ?? html.length),
  }));
}

export function scrapeChickFilA(sourceFile = "chickfila.html") {
  const html = readFileSync(join(ROOT, `data/restaurants/sources/${sourceFile}`), "utf8");
  const itemsById = new Map();

  for (const { category, body } of extractTables(html)) {
    const rows = body.split("<tr").slice(1);
    for (const row of rows) {
      const item = parseRow(row);
      if (!item) continue;
      item.category = category;
      if (!itemsById.has(item.id)) itemsById.set(item.id, item);
    }
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Chick-fil-A",
    source: SOURCE,
    syncedAt: new Date().toISOString(),
    items: [...itemsById.values()],
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeChickFilA();
