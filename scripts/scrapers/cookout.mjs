import {
  makeItem,
  parseConcatenatedNutrition,
  readSource,
  writeChain,
} from "./_shared.mjs";

const CHAIN_ID = "cook-out";

function parseCookOutText(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const items = [];
  let category = "Menu";
  let pendingName = null;
  let pendingServing = null;

  function flush(name, serving, numsLine) {
    const nums = parseConcatenatedNutrition(numsLine, 10, { strictEnd: false });
    if (nums.length < 10 || !name) return;
    const [
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
    ] = nums;
    const ozMatch = serving?.match(/([\d.]+)\s*oz/i);
    items.push(
      makeItem({
        chainId: CHAIN_ID,
        name,
        category,
        servingSize: serving ?? "1 serving",
        servingSizeG: ozMatch ? Number(ozMatch[1]) * 28.35 : 150,
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
      }),
    );
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^SERVING SIZE|^Calories as served|^TOTAL FAT|^VITAMIN|^COOK OUT|^Tray|^Sides|^Quesadillas|^Burgers|^Hot Dogs|^Chicken|^Drinks|^Shakes|^Floats|^Other Menu|^Cook Out Style/.test(line)) {
      if (!/^SERVING|^Calories|^TOTAL|^VITAMIN/.test(line)) category = line;
      continue;
    }

    if (/^\d{3,}$/.test(line.replace(/\s/g, ""))) {
      const numsLine = line.replace(/\s/g, "");
      const name = pendingName;
      const serving = pendingServing;
      flush(name, serving, numsLine);
      pendingName = null;
      pendingServing = null;
      continue;
    }

    if (/\d+\.?\d*\s*oz\s*\(/i.test(line) || /^\d+\.?\d*\s*oz/i.test(line)) {
      pendingServing = line;
      continue;
    }

    if (/^(Small|Regular|Huge|Big Double|Side|Full Order)/i.test(line)) {
      pendingServing = pendingServing ? `${line} · ${pendingServing}` : line;
      continue;
    }

    if (/^Add$|^StyleAdd$/i.test(line) && pendingName) {
      pendingName = `${pendingName} Add`;
      continue;
    }

    if (!/^(Cook Out|Out West|Steak|Cheddar|Orginal|Barbeque|Cajun|Club|Cheese|Everything)/i.test(line) && line.length > 2) {
      pendingName = pendingName ? `${pendingName} ${line}` : line;
    } else if (line.length > 2) {
      pendingName = pendingName ? `${pendingName} ${line}` : line;
    }
  }

  return items;
}

export function scrapeCookOut() {
  const items = parseCookOutText(readSource("cookout-real.txt"));

  return writeChain({
    id: CHAIN_ID,
    name: "Cook Out",
    source: "cookout.com/nutrition",
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeCookOut();
