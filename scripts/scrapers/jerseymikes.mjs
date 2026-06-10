import { makeItem, writeChain } from "./_shared.mjs";

const CHAIN_ID = "jersey-mikes";
const BASE = "https://subs.jerseymikes.com";
const BLACKLIST = new Set(["Catering", "Extra Toppings for US"]);

async function fetchJson(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Kova/1.0)" },
  });
  if (!res.ok) throw new Error(`Jersey Mike's ${path}: ${res.status}`);
  return res.json();
}

function sumDefaultNutrients(productIngredients) {
  const totals = {
    calories: 0,
    fat_g: 0,
    saturated_fat_g: 0,
    trans_fat_g: 0,
    cholesterol_mg: 0,
    sodium_mg: 0,
    carbs_g: 0,
    fiber_g: 0,
    sugar_g: 0,
    protein_g: 0,
  };

  for (const ing of productIngredients) {
    if (ing.inclusion_type !== "D") continue;
    totals.calories += Number(ing.nutrition__total_calories__cal ?? 0);
    totals.fat_g += Number(ing.nutrition__total_fat__g ?? 0);
    totals.saturated_fat_g += Number(ing.nutrition__saturated_fat__g ?? 0);
    totals.trans_fat_g += Number(ing.nutrition__trans_fat__g ?? 0);
    totals.cholesterol_mg += Number(ing.nutrition__cholesterol__mg ?? 0);
    totals.sodium_mg += Number(ing.nutrition__sodium__mg ?? 0);
    totals.carbs_g += Number(ing.nutrition__total_carbohydrate__g ?? 0);
    totals.fiber_g += Number(ing.nutrition__dietary_fiber__g ?? 0);
    totals.sugar_g += Number(ing.nutrition__sugars__g ?? 0);
    totals.protein_g += Number(ing.nutrition__protein__g ?? 0);
  }

  for (const key of Object.keys(totals)) {
    totals[key] = Math.round(totals[key] * 10) / 10;
  }
  return totals;
}

export async function scrapeJerseyMikes() {
  const categories = await fetchJson("/nutrition/data");
  const items = [];

  for (const category of categories) {
    if (BLACKLIST.has(category.name)) continue;
    for (const product of category.products ?? []) {
      for (const size of product.sizes ?? []) {
        const detail = await fetchJson(`/nutrition/${product.id}/${size.id}`);
        const nutrients = sumDefaultNutrients(detail.product_ingredients ?? []);
        if (nutrients.calories <= 0) continue;

        const name = `${product.name} (${size.name})`;
        items.push(
          makeItem({
            chainId: CHAIN_ID,
            name,
            category: category.name,
            servingSize: size.name,
            servingSizeG: 250,
            nutrients,
            tags: ["mikes-way-default"],
          }),
        );
        await new Promise((r) => setTimeout(r, 50));
      }
    }
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Jersey Mike's",
    source: "subs.jerseymikes.com/nutrition",
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeJerseyMikes().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
