import {
  makeItem,
  parseConcatenatedNutrition,
  readSource,
  writeChain,
} from "./_shared.mjs";

const CHAIN_ID = "cava";

function nutrientsFromCava(totalCal, nums) {
  if (nums.length < 10) return null;
  const [
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
    calories: totalCal,
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

export function scrapeCava() {
  const lines = readSource("cava-real.txt").split("\n").map((l) => l.trim());
  const items = [];
  let category = "Menu";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.length < 3) continue;
    if (/^Recipe$|^Cal\.$|^NUTRITION|^Nutrition Guide|^See page|^KIDS MEAL$|^CURATED|^BASES$|^MAINS$|^DRINKS|^DIPS|^Dressings|^While we|^C U R A T E D/.test(line)) {
      if (/^C U R A T E D|^CURATED|^BASES|^MAINS|^KIDS|^DRINKS|^DIPS|^Dressings/.test(line)) {
        category = line.replace(/\s+/g, " ");
      }
      continue;
    }

    const next = lines[i + 1];
    const third = lines[i + 2];
    if (!next) continue;

    if (/^\d{2,4}$/.test(next) && third && /\d{3,}/.test(third)) {
      const totalCal = Number(next);
      const nums = parseConcatenatedNutrition(third, 10, { profile: "cavaMacros" });
      const nutrients = nutrientsFromCava(totalCal, nums);
      if (nutrients && /^[A-Za-z]/.test(line)) {
        items.push(
          makeItem({
            chainId: CHAIN_ID,
            name: line,
            category,
            servingSize: "1 serving",
            servingSizeG: 400,
            nutrients,
          }),
        );
        i += 2;
      }
      continue;
    }

    const nums = parseConcatenatedNutrition(next, 11);
    if (nums.length >= 10 && /^[A-Za-z]/.test(line) && !/^(Cal|Total|Sat|Fiber|Protein)/.test(line)) {
      const nutrients = nutrientsFromCava(nums[0], nums.slice(1));
      if (nutrients) {
        items.push(
          makeItem({
            chainId: CHAIN_ID,
            name: line,
            category,
            servingSize: "1 serving",
            servingSizeG: 100,
            nutrients,
          }),
        );
        i += 1;
      }
    }
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Cava",
    source: "cava.com/nutrition",
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeCava();
