import { makeItem, readSource, writeChain } from "./_shared.mjs";

const CHAIN_ID = "cava";
const SOURCE =
  "assets.ctfassets.net/kugm9fp9ib18/7KrOGNUFZjBddOWezWLWwm/a20b10d71b9b0496f96b8e38bd8e0211/CAVA-REC-GID-0326-AllergReg.pdf";

const SKIP_LINE =
  /^Recipe$|^Cal\.|^NUTRITION|^Nutrition Guide|^See page|^While we|^on supplier|^intolerances|^beverage information|^DIET Contains|^Allergen Guide|^WheatMilk|^VeganVegetarian|^Contains ALLERGEN|^Fish $|^\(Salmon\)|^Shellfish|^\(Shrimp|^where $|^available\)|^®$|^CAVA-REC-/i;

function normalizeCategory(line) {
  return line.replace(/\s+/g, " ").trim();
}

function normalizeCategoryHeader(line) {
  const key = compact(line);
  if (key.includes("CURATEDBOWLS")) return "Curated Bowls";
  if (key.includes("CURATEDPITAS")) return "Curated Pitas";
  if (key === "BASES") return "Bases";
  if (key === "MAINS") return "Mains";
  if (key.includes("KIDSMEAL")) return "Kids Meal";
  if (key === "DRESSINGS") return "Dressings";
  if (key === "SIDES") return "Sides";
  if (key === "TOPPINGS") return "Toppings";
  if (key.includes("DRINKS")) return "Drinks";
  if (key.includes("DIPS+SPREADS")) return "Dips + Spreads";
  return normalizeCategory(line);
}

function compact(line) {
  return line.replace(/\s+/g, "").toUpperCase();
}

function isCategoryLine(line) {
  const key = compact(line);
  return (
    key.includes("CURATEDBOWLS") ||
    key.includes("CURATEDPITAS") ||
    key === "BASES" ||
    key === "MAINS" ||
    key === "KIDMEAL" ||
    key.includes("KIDSMEAL") ||
    key === "DRESSINGS" ||
    key === "SIDES" ||
    key === "TOPPINGS" ||
    key.includes("DRINKS") ||
    key.includes("DIPS+SPREADS")
  );
}

function isCaloriesLine(line) {
  return /^\d{1,4}$/.test(line.trim());
}

function isMacroLine(line) {
  return /[\d.]/.test(line) && !/^[A-Za-z]/.test(line.trim());
}

function nutrientsFromCava(totalCal, tail) {
  if (tail.length !== 10) return null;
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
  ] = tail;
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

const TAIL_MAX = [500, 90, 40, 5, 500, 5000, 250, 40, 120, 90];

function parseCavaTail(rest, totalCal, index = 0, acc = [], out = []) {
  if (rest.startsWith(".")) rest = `0${rest}`;

  if (index === 10) {
    if (rest.length === 0) out.push(acc);
    return out;
  }
  if (!rest.length) return out;

  const tryValue = (val, len) => {
    if (val < 0 || val > TAIL_MAX[index]) return;
    if (index === 0 && val > totalCal) return;
    parseCavaTail(rest.slice(len), totalCal, index + 1, [...acc, val], out);
  };

  if ([1, 2, 3].includes(index)) {
    const dec = rest.match(/^(\d+\.\d{1,2})/);
    if (dec) tryValue(Number(dec[1]), dec[1].length);
  }

  for (let len = Math.min(4, rest.length); len >= 1; len--) {
    const chunk = rest.slice(0, len);
    if (!/^\d+$/.test(chunk)) continue;
    tryValue(Number(chunk), len);
  }

  return out;
}

function scoreCavaRow(totalCal, tail) {
  const [calFromFat, fat, sat, , , sodium, carbs, fiber, sugar, protein] = tail;
  let score = 0;
  if (calFromFat <= totalCal) score += 8;
  if (sat <= fat + 0.01) score += 4;
  if (fiber <= carbs + 0.01) score += 2;
  if (sugar <= carbs + 0.01) score += 2;
  if (sodium >= 0 && sodium <= 5000) score += 4;
  if (protein >= 0 && protein <= 90) score += 4;
  if (carbs >= 0 && carbs <= 250) score += 3;

  const macroCal = fat * 9 + protein * 4 + carbs * 4;
  score -= Math.abs(macroCal - totalCal) / 4;
  if (protein >= 12 && sodium < 150) score -= 12;
  if (fat >= 5 && calFromFat < fat * 7) score -= 10;
  if (sat >= 3 && fat < sat) score -= 10;

  return score;
}

function parseMacroLine(line, totalCal) {
  const cleaned = line.replace(/\s/g, "").replace(/[XYx]+$/g, "");
  if (!cleaned) return null;

  let best = null;
  let bestScore = -Infinity;

  for (const tail of parseCavaTail(cleaned, totalCal)) {
    const score = scoreCavaRow(totalCal, tail);
    if (score > bestScore) {
      bestScore = score;
      best = tail;
    }
  }

  return best;
}

function shouldStop(line) {
  return (
    /^DIET Contains/.test(line) ||
    /^Allergen Guide/.test(line) ||
    (line === "CURATED PITAS" && !line.includes("+"))
  );
}

function parseNutritionSection(text) {
  const lines = text.split("\n").map((l) => l.trim());
  const stopAt = lines.findIndex((line, idx) => idx > 200 && shouldStop(line));
  const slice = stopAt === -1 ? lines : lines.slice(0, stopAt);

  const itemsById = new Map();
  let category = "Menu";

  for (let i = 0; i < slice.length; i++) {
    let line = slice[i];
    if (!line || line.length < 2 || SKIP_LINE.test(line)) continue;
    if (isCategoryLine(line)) {
      category = normalizeCategoryHeader(line);
      continue;
    }

    if (line.endsWith("®")) {
      line = line.replace(/®$/, "").trim();
    }

    if (!/^[A-Za-z0-9!]/.test(line)) continue;

    let name = line.replace(/\s+/g, " ").trim();
    while (i + 1 < slice.length) {
      const peek = slice[i + 1];
      if (!peek || isCategoryLine(peek) || isCaloriesLine(peek) || SKIP_LINE.test(peek)) break;
      if (peek === "®") break;
      const afterPeek = slice[i + 2];
      if (!isCaloriesLine(afterPeek ?? "")) break;
      if (/^[A-Za-z]/.test(peek)) {
        name = `${name} ${peek.replace(/\s+/g, " ").trim()}`.trim();
        i += 1;
      } else break;
    }

    if (slice[i + 1] === "®") i += 1;

    const calLine = slice[i + 1];
    const macroLine = slice[i + 2];
    if (!isCaloriesLine(calLine) || !isMacroLine(macroLine)) continue;

    const totalCal = Number(calLine);
    const tail = parseMacroLine(macroLine, totalCal);
    const nutrients = tail ? nutrientsFromCava(totalCal, tail) : null;
    if (nutrients && name && !/^\d/.test(name)) {
      const item = makeItem({
        chainId: CHAIN_ID,
        name,
        category,
        servingSize: "1 serving",
        servingSizeG: totalCal > 600 ? 450 : totalCal > 300 ? 350 : 150,
        nutrients,
      });

      if (!itemsById.has(item.id)) itemsById.set(item.id, item);
    }
    i += 2;
  }

  return [...itemsById.values()];
}

export function scrapeCava(sourceFile = "cava-allergens-reg-0326.txt") {
  const text = readSource(sourceFile);
  const items = parseNutritionSection(text);

  return writeChain({
    id: CHAIN_ID,
    name: "Cava",
    source: SOURCE,
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeCava();
