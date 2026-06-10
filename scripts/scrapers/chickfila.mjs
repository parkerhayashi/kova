import { readFileSync } from "fs";
import { join } from "path";
import { makeItem, ROOT, writeChain } from "./_shared.mjs";

const CHAIN_ID = "chick-fil-a";

export function scrapeChickFilA() {
  const html = readFileSync(
    join(ROOT, "data/restaurants/sources/chickfila.html"),
    "utf8",
  );
  const rows = html.split("<tr").slice(1);
  const items = [];

  for (const row of rows) {
    const title = row.match(/context\.menu_item\.title">([^<]+)/)?.[1];
    if (!title) continue;
    const values = [...row.matchAll(/inert\s*>\s*([^<]+?)\s*<\/span>/g)]
      .map((m) => m[1].trim())
      .filter((v) => v && v !== "✓");
    if (values.length < 11) continue;

    const servingSize = values[0];
    const servingG = Number.parseFloat(servingSize) || 100;
    items.push(
      makeItem({
        chainId: CHAIN_ID,
        name: title.replace(/&amp;/g, "&").replace(/&#174;/g, "®"),
        category: "Menu",
        servingSize,
        servingSizeG: servingG,
        nutrients: {
          calories: Number(values[1]),
          fat_g: Number(values[2]),
          saturated_fat_g: Number(values[3]),
          trans_fat_g: Number(values[4]),
          cholesterol_mg: Number(values[5]),
          sodium_mg: Number(values[6]),
          carbs_g: Number(values[7]),
          fiber_g: Number(values[8]),
          sugar_g: Number(values[9]),
          protein_g: Number(values[10]),
        },
      }),
    );
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Chick-fil-A",
    source: "chick-fil-a.com/nutrition-allergens",
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeChickFilA();
