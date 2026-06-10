import { readFileSync } from "fs";
import { join } from "path";
import { makeItem, readSource, writeChain } from "./_shared.mjs";

const CHAIN_ID = "shahs-halal";
const SOURCE = "shahshalalfood.com/nutritional-breakdown";

/** Official recipe name → catalog entry (stable ids for search history). */
const MENU = [
  { recipe: "Chicken and Rice", id: "chicken-over-rice", name: "Chicken Over Rice", category: "Plates" },
  { recipe: "Lamb and Rice", id: "lamb-over-rice", name: "Lamb Over Rice", category: "Plates" },
  {
    recipe: "Combo (Chicken and Lamb) Over Rice",
    id: "combo-over-rice",
    name: "Combo Over Rice",
    category: "Plates",
  },
  { recipe: "Falafel over Rice", id: "falafel-over-rice", name: "Falafel Over Rice", category: "Plates" },
  {
    recipe: "2 Pc Fish over Rice",
    id: "fish-over-rice-2pcs",
    name: "Fish Over Rice (2pcs)",
    category: "Plates",
  },
  {
    recipe: "Kofta Kebab over Rice",
    id: "kofta-kabab-over-rice",
    name: "Kofta Kabab Over Rice",
    category: "Plates",
  },
  { recipe: "Chicken Gyro", id: "chicken-gyro", name: "Chicken Gyro", category: "Gyros" },
  { recipe: "Lamb Gyro", id: "lamb-gyro", name: "Lamb Gyro", category: "Gyros" },
  { recipe: "Combo Gyro", id: "combo-gyro", name: "Combo Gyro", category: "Gyros" },
  { recipe: "Falafel on a Pita", id: "falafel-on-pita", name: "Falafel on a Pita", category: "Gyros" },
  {
    recipe: "Kofta Kebab on a Pita",
    id: "kofta-kabab-on-pita",
    name: "Kofta Kabab on a Pita",
    category: "Gyros",
  },
  {
    recipe: "2 pc Fish on a Pita",
    id: "fish-on-pita-2pcs",
    name: "Fish on a Pita (2pcs)",
    category: "Gyros",
  },
  {
    recipe: "Chicken Cheesesteak",
    id: "chicken-cheese-steak",
    name: "Chicken Cheesesteak",
    category: "Sandwiches",
  },
  {
    recipe: "Philly Cheesesteak",
    id: "philly-cheese-steak",
    name: "Philly Cheesesteak",
    category: "Sandwiches",
  },
  { recipe: "Chicken Sandwich", id: "chicken-sandwich", name: "Chicken Sandwich", category: "Sandwiches" },
  { recipe: "Cheeseburger", id: "cheeseburger", name: "Cheeseburger", category: "Burgers" },
  { recipe: "French Fries", id: "french-fries", name: "French Fries", category: "Sides" },
  {
    recipe: "6 pc Chicken Nuggets",
    id: "chicken-nuggets-6pc",
    name: "Chicken Nuggets (6pc)",
    category: "Sides",
  },
  { recipe: "6 pc Hot Wings", id: "hot-wings-6pc", name: "Hot Wings (6pc)", category: "Sides" },
  {
    recipe: "Salad With Chicken",
    id: "salad-with-chicken",
    name: "Salad With Chicken",
    category: "Salads",
  },
  { recipe: "Salad With Lamb", id: "salad-with-lamb", name: "Salad With Lamb", category: "Salads" },
  {
    recipe: "Salad With Combo Protein",
    id: "salad-with-combo",
    name: "Salad With Combo Protein",
    category: "Salads",
  },
];

function parseTableRow(line) {
  return line
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function parseWeightG(text) {
  const m = text.match(/([\d.]+)\s*g/i);
  if (!m) return null;
  const value = Number(m[1]);
  return value > 0 ? value : null;
}

function defaultServingWeightG(recipeName) {
  if (/over rice/i.test(recipeName)) return 425.2;
  if (/gyro|pita|cheesesteak|sandwich|burger/i.test(recipeName)) return 538.6;
  if (/salad/i.test(recipeName)) return 350;
  if (/nuggets|wings/i.test(recipeName)) return 170;
  if (/fries/i.test(recipeName)) return 170.1;
  return 425;
}

/** Extract every recipe block: name, serving weight, totals row nutrients. */
export function parseNutritionalBreakdown(markdown) {
  const lines = markdown.split("\n");
  const recipes = new Map();

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].includes("| Recipe Name")) continue;

    const nameRow = lines[i + 2];
    if (!nameRow?.startsWith("|")) continue;

    const nameCells = parseTableRow(nameRow);
    const recipeName = nameCells[0];
    if (!recipeName || recipeName === "Recipe Name") continue;

    const servingSize = nameCells[1] ?? "1 serving";
    let servingWeightG = parseWeightG(nameCells[2] ?? "") ?? parseWeightG(servingSize);
    if (!servingWeightG) servingWeightG = defaultServingWeightG(recipeName);

    for (let j = i + 3; j < Math.min(i + 20, lines.length); j++) {
      const row = parseTableRow(lines[j]);
      if (row[0] !== "Totals (per serving)") continue;

      recipes.set(recipeName, {
        recipeName,
        servingSize,
        servingWeightG: servingWeightG ?? defaultServingWeightG(recipeName),
        nutrients: {
          calories: Math.round(Number(row[2])),
          fat_g: round1(row[3]),
          saturated_fat_g: round1(row[4]),
          trans_fat_g: round1(row[5]),
          cholesterol_mg: round1(row[6]),
          sodium_mg: round1(row[7]),
          carbs_g: round1(row[8]),
          fiber_g: round1(row[9]),
          sugar_g: round1(row[11]),
          protein_g: round1(row[13]),
        },
      });
      break;
    }
  }

  return recipes;
}

function round1(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 10) / 10;
}

function makeCatalogItem(entry, parsed) {
  const servingG = parsed.servingWeightG;
  const rawSize = parsed.servingSize?.trim() ?? "";
  const servingSize =
    rawSize && !/^0(\.0)?\s*g$/i.test(rawSize) && rawSize !== "each"
      ? rawSize.includes("g")
        ? rawSize
        : `${servingG} g`
      : `${Math.round(servingG * 10) / 10} g`;

  return {
    id: `${CHAIN_ID}:${entry.id}`,
    name: entry.name,
    category: entry.category,
    menu: null,
    servingSize,
    serving_size_g: Math.round(servingG),
    tags: [],
    nutrients: parsed.nutrients,
  };
}

export function buildShahsHalalChain(markdown) {
  const recipes = parseNutritionalBreakdown(markdown);
  const items = [];
  const missing = [];

  for (const entry of MENU) {
    const parsed = recipes.get(entry.recipe);
    if (!parsed) {
      missing.push(entry.recipe);
      continue;
    }
    items.push(makeCatalogItem(entry, parsed));
  }

  if (missing.length) {
    console.warn(`  ⚠ Missing recipes in breakdown: ${missing.join(", ")}`);
  }

  return {
    id: CHAIN_ID,
    name: "Shah's Halal Food",
    source: SOURCE,
    syncedAt: new Date().toISOString(),
    items,
  };
}

export function scrapeShahsHalalFromBreakdown(sourceFile = "shahs-nutritional-breakdown.md") {
  const markdown = readSource(sourceFile);
  const chain = buildShahsHalalChain(markdown);
  return writeChain(chain);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    scrapeShahsHalalFromBreakdown();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
