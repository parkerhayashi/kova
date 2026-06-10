/**
 * One-time / occasional sync of Duke NetNutrition fixed retail menus.
 * Excludes Marketplace and Trinity Cafe (rotating dining halls).
 *
 * Usage: npm run duke:sync
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_PATH = join(ROOT, "data/duke-dining/catalog.json");
const LEGACY_PATH = join(ROOT, "data/duke-dining/food-devil-legacy.json");

const BASE = "https://netnutrition.cbord.com/nn-prod/Duke";
const SKIP_UNITS = new Set(["4", "5"]); // Marketplace, Trinity Cafe
const DELAY_MS = 120;

/** Rotating halls — never import. */
const SKIP_LEGACY = new Set(["Marketplace", "Trinity Cafe"]);

let cookie = "";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function req(path, opts = {}) {
  const url = path.startsWith("http")
    ? path
    : `https://netnutrition.cbord.com${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; KovaDukeSync/1.0)",
      Cookie: cookie,
      ...(opts.headers || {}),
    },
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() || []) {
    const kv = c.split(";")[0];
    const key = kv.split("=")[0];
    if (!cookie.includes(`${key}=`)) cookie += (cookie ? "; " : "") + kv;
  }
  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("location");
    return req(
      loc.startsWith("http") ? loc : `https://netnutrition.cbord.com${loc}`,
      opts,
    );
  }
  return res;
}

async function post(endpoint, params) {
  const res = await req(`${BASE}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const ct = res.headers.get("content-type") || "";
  const text = await res.text();
  if (ct.includes("json")) return JSON.parse(text);
  return text;
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseNutrientAmount(raw) {
  if (!raw) return null;
  const cleaned = raw.replace(/&nbsp;/g, " ").trim();
  if (!cleaned || /^n\/?a$/i.test(cleaned)) return null;
  const match = cleaned.match(/([\d.]+)/);
  return match ? Math.round(parseFloat(match[1]) * 10) / 10 : null;
}

function parseServingSizeG(servingText) {
  const cleaned = servingText.replace(/&nbsp;/g, " ").trim();
  const gMatch = cleaned.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (gMatch) return Math.round(parseFloat(gMatch[1]));
  const ozMatch = cleaned.match(/([\d.]+)\s*oz/i);
  if (ozMatch) return Math.round(parseFloat(ozMatch[1]) * 28.35);
  return 100;
}

function parseNutritionLabelHtml(html) {
  const name = html.match(/cbo_nn_LabelHeader[^>]*>([^<]+)/)?.[1]?.trim();
  if (!name) return null;

  const servingBlock = html.match(
    /Serving Size<\/div><div[^>]*>([^<]+(?:\([^)]*\))?)/,
  )?.[1];
  const servingSize = (servingBlock ?? "1 serving")
    .replace(/&nbsp;/g, " ")
    .trim();

  const nutrients = {};
  const caloriesRaw = html.match(
    /Calories<\/span><\/div><div[^>]*>(\d+)/,
  )?.[1];
  if (caloriesRaw) nutrients.calories = parseInt(caloriesRaw, 10);

  const fields = [
    ["fat_g", /Total Fat<\/span><span>&nbsp;([^<]+)/],
    ["saturated_fat_g", /Saturated Fat<\/span><span>&nbsp;([^<]+)/],
    ["trans_fat_g", /Trans.*?Fat<\/span><span>&nbsp;([^<]+)/i],
    ["cholesterol_mg", /Cholesterol<\/span><span>&nbsp;([^<]+)/],
    ["sodium_mg", /Sodium<\/span><span>&nbsp;([^<]+)/],
    ["carbs_g", /Total Carbohydrate<\/span><span>&nbsp;([^<]+)/],
    ["fiber_g", /Dietary Fiber<\/span><span>&nbsp;([^<]+)/],
    ["sugar_g", /Total Sugars<\/span><span>&nbsp;([^<]+)/],
    ["protein_g", /Protein<\/span><span>&nbsp;([^<]+)/],
    ["potassium_mg", /Potassium<\/span><span>&nbsp;([^<]+)/],
    ["calcium_mg", /Calcium<\/span><span>&nbsp;([^<]+)/],
    ["iron_mg", /Iron<\/span><span>&nbsp;([^<]+)/],
  ];

  for (const [key, re] of fields) {
    const val = parseNutrientAmount(html.match(re)?.[1]);
    if (val != null) nutrients[key] = val;
  }

  const ingredients = html
    .match(/Ingredients?:?<\/[^>]+>([^<]+)/i)?.[1]
    ?.replace(/&nbsp;/g, " ")
    .trim();

  return {
    name,
    servingSize,
    serving_size_g: parseServingSizeG(servingSize),
    nutrients,
    ingredients: ingredients || undefined,
  };
}

function parseUnits(html) {
  const units = [];
  for (const block of html.split("<div class='dropdown-item'>")) {
    const oid = block.match(/data-unitoid='(\d+)'/)?.[1];
    if (!oid || oid === "-1" || SKIP_UNITS.has(oid)) continue;
    const tag = block.match(/<a [^>]+>/)?.[0] || "";
    const titleIdx = tag.indexOf("title='");
    if (titleIdx < 0) continue;
    const rest = tag.slice(titleIdx + 7);
    const oidIdx = rest.indexOf("' data-unitoid");
    const title = oidIdx >= 0 ? rest.slice(0, oidIdx) : rest;
    units.push({ oid, title });
  }
  return units;
}

function parseItemsFromPanel(html) {
  const items = [];
  let currentCategory = null;
  const rows = html.split("<tr");
  for (const row of rows) {
    if (row.includes("cbo_nn_itemGroupRow")) {
      const m = row.match(/role='button'>([^<]+)/);
      if (m) currentCategory = m[1].replace(/<[^>]+>/g, "").trim();
    }
    if (!row.includes("data-detailoid=")) continue;
    const detailOid = row.match(/data-detailoid='(\d+)'/)?.[1];
    const name = row.match(/class='cbo_nn_itemHover'>([^<]+)/)?.[1]?.trim();
    const servingCells = [
      ...row.matchAll(/<td class='align-middle'>([^<]+)<\/td>/g),
    ];
    const servingSize = servingCells[0]?.[1]?.trim() ?? "1 serving";
    const tags = [...row.matchAll(/<img title='([^']+)'/g)].map((m) => m[1]);
    if (detailOid && name) {
      items.push({
        detailOid,
        name,
        category: currentCategory,
        servingSize,
        tags,
      });
    }
  }
  return items;
}

function extractMenus(html) {
  const seen = new Set();
  const menus = [];
  for (const m of html.matchAll(
    /menuListSelectMenu\((\d+)\)[^>]*>([^<]+)</g,
  )) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    menus.push({ menuOid: m[1], name: m[2].trim() });
  }
  return menus;
}

function foodDevilToItems(locationName, data) {
  const locationId = slugify(locationName);
  const items = [];

  function walk(node, menu, category) {
    for (const [key, value] of Object.entries(node)) {
      if (!value || typeof value !== "object") continue;
      if ("calories" in value && "protein" in value) {
        const servingSize = value.serving_size ?? "1 serving";
        items.push({
          id: `duke:legacy:${locationId}:${slugify(key)}`,
          name: key,
          location: locationName,
          locationId,
          category,
          menu,
          servingSize,
          serving_size_g: parseServingSizeG(servingSize),
          tags: [],
          nutrients: {
            calories: parseNutrientAmount(value.calories) ?? undefined,
            protein_g: parseNutrientAmount(value.protein) ?? undefined,
            carbs_g: parseNutrientAmount(value.carb) ?? undefined,
            fat_g: parseNutrientAmount(value.total_fat) ?? undefined,
            saturated_fat_g: parseNutrientAmount(value.saturated_fat) ?? undefined,
            trans_fat_g: parseNutrientAmount(value.trans_fat) ?? undefined,
            cholesterol_mg:
              parseNutrientAmount(value.chloestrol ?? value.cholesterol) ??
              undefined,
            sodium_mg: parseNutrientAmount(value.sodium) ?? undefined,
            fiber_g: parseNutrientAmount(value.fiber) ?? undefined,
            sugar_g: parseNutrientAmount(value.sugar) ?? undefined,
          },
          ingredients: value.ingredients,
        });
      } else {
        walk(value, menu, key);
      }
    }
  }

  for (const [menuKey, menuVal] of Object.entries(data)) {
    if (menuKey === "all_items") walk(menuVal, null, null);
    else if (menuVal && typeof menuVal === "object") walk(menuVal, menuKey, null);
  }
  return items;
}

async function fetchNutrition(detailOid) {
  await sleep(DELAY_MS);
  const html = await post("NutritionDetail/ShowItemNutritionLabel", {
    detailOid,
    menuOid: "",
  });
  if (typeof html !== "string") return null;
  return parseNutritionLabelHtml(html);
}

async function scrapeUnit(unit) {
  const locationId = slugify(unit.title);
  const catalogItems = [];
  const seen = new Set();

  console.log(`\n→ ${unit.title} (${unit.oid})`);
  const data = await post("Unit/SelectUnitFromSideBar", { unitOid: unit.oid });
  if (!data?.panels) {
    console.log("  skipped — no panels");
    return catalogItems;
  }

  const panels = Object.fromEntries(data.panels.map((p) => [p.id, p.html || ""]));
  const menuSets = [];

  if (panels.menuPanel?.includes("no menus available")) {
    console.log("  no live menus on NetNutrition");
  } else if (panels.menuPanel) {
    const menus = extractMenus(panels.menuPanel);
    for (const menu of menus) {
      await sleep(DELAY_MS);
      const menuData = await post("Menu/SelectMenu", { menuOid: menu.menuOid });
      const itemHtml = menuData?.panels?.find((p) => p.id === "itemPanel")?.html;
      if (itemHtml) menuSets.push({ menu: menu.name, html: itemHtml });
    }
  } else if (panels.itemPanel) {
    menuSets.push({ menu: null, html: panels.itemPanel });
  }

  for (const { menu, html } of menuSets) {
    const parsed = parseItemsFromPanel(html);
    console.log(`  ${menu ?? "menu"}: ${parsed.length} items`);

    for (const item of parsed) {
      if (seen.has(item.detailOid)) continue;
      seen.add(item.detailOid);

      const label = await fetchNutrition(item.detailOid);
      if (!label) continue;

      catalogItems.push({
        id: `duke:${item.detailOid}`,
        name: label.name || item.name,
        location: unit.title,
        locationId,
        category: item.category,
        menu,
        servingSize: label.servingSize || item.servingSize,
        serving_size_g: label.serving_size_g,
        tags: item.tags,
        nutrients: label.nutrients,
        ingredients: label.ingredients,
      });
    }
  }

  console.log(`  ✓ ${catalogItems.length} with nutrition`);
  return catalogItems;
}

async function loadLegacyData() {
  try {
    return JSON.parse(readFileSync(LEGACY_PATH, "utf8"));
  } catch {
    console.log("\nDownloading food-devil archive for fallback menus…");
    const res = await fetch(
      "https://raw.githubusercontent.com/bluqiu001/food-devil-backend/main/scripts/final.json",
    );
    if (!res.ok) throw new Error(`legacy download failed: ${res.status}`);
    const legacyData = await res.json();
    mkdirSync(dirname(LEGACY_PATH), { recursive: true });
    writeFileSync(LEGACY_PATH, JSON.stringify(legacyData));
    return legacyData;
  }
}

/** Map NetNutrition unit titles → food-devil keys when names differ. */
const LEGACY_NAME_MAP = {
  "J.B.'s Roast & Chops": "J.B.'s Roast & Chops",
  Sazon: "Sazon",
  "The Devils Krafthouse": "The Devils Krafthouse",
};

function legacyItemsForLocation(legacyData, locationName) {
  const key =
    LEGACY_NAME_MAP[locationName] ??
    Object.keys(legacyData).find(
      (k) => slugify(k) === slugify(locationName),
    );
  if (!key || SKIP_LEGACY.has(key) || !legacyData[key]) return [];
  return foodDevilToItems(key, legacyData[key]);
}

async function main() {
  console.log("Duke dining sync — NetNutrition fixed retail spots");
  const legacyData = await loadLegacyData();

  await req("/nn-prod/Duke");
  const html = await (await req("/nn-prod/Duke")).text();
  const units = parseUnits(html);
  console.log(`Live units (excl. Marketplace/Trinity): ${units.length}`);

  const liveByLocation = new Map();
  for (const unit of units) {
    try {
      const items = await scrapeUnit(unit);
      liveByLocation.set(unit.title, items);
    } catch (err) {
      console.error(`  error: ${err.message}`);
      liveByLocation.set(unit.title, []);
    }
  }

  console.log("\nFilling gaps from food-devil archive…");
  const allItems = [];
  const covered = new Set();

  for (const [locationName, liveItems] of liveByLocation) {
    if (liveItems.length > 0) {
      allItems.push(...liveItems);
      covered.add(slugify(locationName));
      continue;
    }
    const fallback = legacyItemsForLocation(legacyData, locationName);
    if (fallback.length > 0) {
      console.log(`  fallback ${locationName}: ${fallback.length} items`);
      allItems.push(...fallback);
      covered.add(slugify(locationName));
    }
  }

  for (const [name, data] of Object.entries(legacyData)) {
    if (SKIP_LEGACY.has(name)) continue;
    const id = slugify(name);
    if (covered.has(id)) continue;
    const items = foodDevilToItems(name, data);
    if (items.length > 0) {
      console.log(`  legacy-only ${name}: ${items.length} items`);
      allItems.push(...items);
    }
  }
  const locationMap = new Map();
  for (const item of allItems) {
    if (!locationMap.has(item.locationId)) {
      locationMap.set(item.locationId, {
        id: item.locationId,
        name: item.location,
        itemCount: 0,
      });
    }
    locationMap.get(item.locationId).itemCount += 1;
  }

  const catalog = {
    syncedAt: new Date().toISOString(),
    source: "netnutrition.cbord.com/nn-prod/Duke + food-devil legacy",
    locations: [...locationMap.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    ),
    items: allItems,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(catalog, null, 2));
  console.log(
    `\nDone — ${catalog.items.length} items across ${catalog.locations.length} locations`,
  );
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
