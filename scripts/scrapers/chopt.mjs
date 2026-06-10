import {
  makeItem,
  parseConcatenatedNutrition,
  readSource,
  writeChain,
} from "./_shared.mjs";

const CHAIN_ID = "chopt";

function parseChoptEntry(name, dataLine) {
  const m = dataLine.match(/^1\s+(salad|wrap|bowl|sandwich|roll|portion)(\d.*)$/i);
  if (!m) return null;
  const nums = parseConcatenatedNutrition(m[2], 11, { strictEnd: false });
  if (nums.length < 11) return null;
  const [
    calories,
    _calFromFat,
    fat_g,
    saturated_fat_g,
    trans_fat_g,
    cholesterol_mg,
    sodium_mg,
    carbs_g,
    fiber_g,
    sugar_g,
    protein_g,
  ] = nums;
  return {
    name: name.trim(),
    nutrients: {
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
    },
  };
}

export function scrapeChopt() {
  const lines = readSource("chopt-real2.txt")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const items = [];
  let category = "Menu";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^SALADS$|^WRAPS$|^WARM BOWLS$|^SANDWICHES|^CORE CHOPPINGS$|^GREENS$|^DRESSINGS$|^SANDWICH INGREDIENTS$/.test(line)) {
      category = line;
      continue;
    }
    if (/^SERVING|^UPDATED|^NUTRITION|^Nutritional|^Your health|^Consuming raw|^DAIRYEGGS|^SELECT LOCATIONS/.test(line)) {
      continue;
    }

    let dataLine = lines[i + 1];
    if (dataLine === "1" && lines[i + 2]?.startsWith("1 ")) {
      dataLine = lines[i + 2];
      i += 1;
    }

    if (!dataLine?.match(/^1\s+(salad|wrap|bowl|sandwich|roll|portion)/i)) continue;
    const parsed = parseChoptEntry(line, dataLine);
    if (!parsed || parsed.name.length < 2) continue;
    items.push(
      makeItem({
        chainId: CHAIN_ID,
        name: parsed.name,
        category,
        servingSize: "1 serving",
        servingSizeG: 350,
        nutrients: parsed.nutrients,
      }),
    );
    i += 1;
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Chopt",
    source: "choptsalad.com/nutrition-and-allergens",
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeChopt();
