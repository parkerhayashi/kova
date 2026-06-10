import {
  makeItem,
  parseConcatenatedNutrition,
  readSource,
  writeChain,
} from "./_shared.mjs";

const CHAIN_ID = "bojangles";

function parseBojanglesLine(line) {
  const cleaned = line.replace(/®/g, "").replace(/\s+/g, " ").trim();
  const m = cleaned.match(/^(.+?)(Ind\.|Sm|Medium|Picnic|Regular|\d+\.?\d*\s*oz|\d+\s*Bowl|\d+\s*fl\s*oz|2\s*oz|1\.5\s*oz|1\/2\s*oz)([\d.]+.*)$/i);
  if (!m) {
    const m2 = cleaned.match(/^(.+?)([\d.]{3,}.*)$/);
    if (!m2 || m2[1].length < 3) return null;
    const nums = parseConcatenatedNutrition(m2[2], 11);
    if (nums.length < 11) return null;
    return {
      name: m2[1].trim(),
      servingSize: "1 serving",
      nutrients: bojanglesNutrients(nums),
    };
  }
  const nums = parseConcatenatedNutrition(m[3], 11);
  if (nums.length < 11) return null;
  return {
    name: m[1].trim(),
    servingSize: m[2].trim(),
    nutrients: bojanglesNutrients(nums),
  };
}

function bojanglesNutrients(nums) {
  const [
    calories,
    _calFromFat,
    fat_g,
    saturated_fat_g,
    trans_fat_g,
    cholesterol_mg,
    carbs_g,
    sodium_mg,
    sugar_g,
    protein_g,
    fiber_g,
  ] = nums;
  return {
    calories,
    fat_g,
    saturated_fat_g,
    trans_fat_g,
    cholesterol_mg,
    sodium_mg,
    carbs_g,
    fiber_g,
    sugar_g,
    protein_g,
  };
}

export function scrapeBojangles() {
  const text = readSource("bojangles-real.txt");
  const items = [];
  let category = "Menu";

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^FIXIN|^BISCUITS|^BOWLS|^DIPPING|^SALAD|^SWEET|^CHICKEN|^BREAKFAST|^BEVERAGES|^DESSERTS|^PO BOYS|^SANDWICHES|^COMBOS|^KIDS/.test(line)) {
      category = line.replace(/\s+/g, " ");
      continue;
    }
    if (/^Nutrition Facts|^Serving Size|^Allergens|^©|^MENU NUTRITION|^The above/.test(line)) continue;

    const parsed = parseBojanglesLine(line);
    if (!parsed) continue;
    items.push(
      makeItem({
        chainId: CHAIN_ID,
        name: parsed.name,
        category,
        servingSize: parsed.servingSize,
        servingSizeG: 150,
        nutrients: parsed.nutrients,
      }),
    );
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Bojangles",
    source: "bojangles.com/menu/nutrition",
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeBojangles();
