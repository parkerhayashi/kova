import {
  makeItem,
  nutrientsFromStandardRow,
  parseConcatenatedNutrition,
  readSource,
  writeChain,
} from "./_shared.mjs";

const CHAIN_ID = "five-guys";

export function scrapeFiveGuys() {
  const text = readSource("fiveguys-real.txt");
  const items = [];
  let category = "Menu";

  for (const raw of text.split("\n")) {
    const line = raw.replace(/\u00ae|®/g, "").trim();
    if (!line) continue;
    if (/^MEAT$|^BUN$|^FRIES|^TOPPINGS$|^MILKSHAKES$|^MIX-INS$|^NUTRITION$|^ALLERGENS$/.test(line)) {
      category = line;
      continue;
    }
    if (/^Serving Size|^Calories|^Crustaceans|^FIVE GUYS/.test(line)) continue;

    const m = line.match(/^(.+?)(\d+\.?\d*.*)$/);
    if (!m || m[1].length < 2) continue;
    const name = m[1].trim();
    if (/Supplier/.test(name) && items.some((i) => i.name.startsWith(name.split("(")[0].trim()))) {
      continue;
    }
    const nums = parseConcatenatedNutrition(m[2], 12, { profile: "servingFirst" });
    if (nums.length < 12) continue;
    const servingG = nums[0];
    const nutrients = nutrientsFromStandardRow(nums.slice(1));
    if (!nutrients) continue;

    items.push(
      makeItem({
        chainId: CHAIN_ID,
        name,
        category,
        servingSize: `${servingG} g`,
        servingSizeG: servingG,
        nutrients,
      }),
    );
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Five Guys",
    source: "fiveguys.com/nutritional-allergy-information",
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeFiveGuys();
