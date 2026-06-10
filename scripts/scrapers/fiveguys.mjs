import { makeItem, readSource, writeChain } from "./_shared.mjs";

const CHAIN_ID = "five-guys";
const SOURCE =
  "fiveguys.com/wp-content/uploads/2025/07/five-guys-us-nutrition-allergen-guide-english-1-final.pdf";

const CATEGORY_RE =
  /^(MEAT|BUN|FRIES(?: - COOKED IN 100% PEANUT OIL)?|TOPPINGS|MILKSHAKES|MIX-INS(?: \(.*\))?|OTHER ITEMS)$/;

const SKIP_RE =
  /^(Serving Size|Calories|Calories from|Total Fat|Saturated Fat|Trans Fat|Cholesterol|Sodium|Carbs|Fiber|Sugars|Protein|Crustaceans|Shellfish|Eggs|Fish|Gluten|Milk|Peanuts|Sesame|Soybeans|Tree Nuts|NUTRITION|ALLERGENS|FIVE GUYS|NUTRITION\/ALLERGEN CHART|NUTRITION & ALLERGEN|•+|Nutritional information|Recommended limits|There is a possibility|Five Guys Enterprises|Guys Enterprises|variations in serving|INGREDIENT LISTING|Contains:|May contain:|Cured With:|Beef,|Water,|Tomato|Potatoes,|Milkfat|Cream,|Corn Syrup|Unbleached|Pure Cane|Sugar,|Coffee|Fresh |Bulk Peanuts \(1oz\.\)Cured)/;

const TAIL_MAX = [500, 90, 40, 5, 500, 3500, 250, 50, 120, 90];

const PATCHES = {
  "Hamburger Patty": {
    servingG: 65,
    nutrients: {
      calories: 302,
      fat_g: 17,
      saturated_fat_g: 8,
      trans_fat_g: 0,
      cholesterol_mg: 60,
      sodium_mg: 500,
      carbs_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      protein_g: 16,
    },
  },
};

function decodeName(text) {
  return text.replace(/\s+/g, " ").replace(/®/g, "®").trim();
}

function nutrientsFromRow(calories, tail) {
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

function cleanDigits(raw) {
  return raw
    .replace(/•+/g, "")
    .replace(/<\s*1(?=\d|<|$)/g, "0")
    .replace(/<\s*1/g, "0")
    .replace(/\s/g, "")
    .replace(/(\d{3})000016$/g, "$1000016")
    .replace(/(\d{3})00011$/g, "$1000011");
}

function parseTail(rest, totalCal, index = 0, acc = [], out = []) {
  if (rest.startsWith(".")) rest = `0${rest}`;

  if (index === 10) {
    if (rest.length === 0) out.push(acc);
    return out;
  }
  if (!rest.length) return out;

  const tryValue = (val, len) => {
    if (val < 0 || val > TAIL_MAX[index]) return;
    if (index === 0 && val > totalCal) return;
    parseTail(rest.slice(len), totalCal, index + 1, [...acc, val], out);
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

function scoreRow(totalCal, tail) {
  const [calFromFat, fat, sat, trans, chol, sodium, carbs, fiber, sugar, protein] =
    tail;
  let score = 0;
  if (calFromFat <= totalCal) score += 8;
  if (sat <= fat + 0.01) score += 4;
  if (trans <= fat + 0.01) score += 2;
  if (fiber <= carbs + 0.01) score += 2;
  if (sodium >= 0 && sodium <= 3500) score += 4;
  if (protein >= 0 && protein <= 90) score += 4;
  if (carbs >= 0 && carbs <= 250) score += 3;
  const macroCal = fat * 9 + protein * 4 + carbs * 4;
  score -= Math.abs(macroCal - totalCal) / 3;
  if (fat >= 3) score -= Math.abs(calFromFat - fat * 9) / 5;
  if (fat >= 10 && calFromFat < fat * 7) score -= 20;
  if (protein > 25 && totalCal < 450) score -= (protein - 25) * 2;
  if (sodium < 50 && totalCal > 200) score -= 8;
  if (totalCal >= 400 && protein < 10) score -= 25;
  if (totalCal >= 400 && protein >= 15) score += 8;
  if (totalCal >= 400 && sodium >= 800) score += 4;
  if (totalCal >= 500 && carbs >= 40) score += 5;
  if (totalCal >= 250 && totalCal <= 350 && protein >= 14 && carbs <= 5) score += 6;
  if (totalCal < 350 && fat >= 15 && carbs > 10) score -= 15;
  if (totalCal >= 200 && totalCal <= 320 && protein >= 10 && carbs <= 2) score += 5;
  if (fat >= 10 && protein >= 10 && carbs > 15) score -= 30;
  return score;
}

function parseKnownCalTail(rest, calories) {
  const cleaned = cleanDigits(rest);
  if (!cleaned) return null;

  let bestTail = null;
  let bestScore = -Infinity;
  for (const tail of parseTail(cleaned, calories)) {
    const score = scoreRow(calories, tail);
    if (score > bestScore) {
      bestScore = score;
      bestTail = tail;
    }
  }

  return bestTail ? { calories, tail: bestTail } : null;
}

function parseItemDigits(digits) {
  const cleaned = cleanDigits(digits);
  if (!cleaned || cleaned.length < 8) return null;

  let best = null;
  let bestScore = -Infinity;

  for (let servingLen of [3, 2, 4]) {
    const servingG = Number(cleaned.slice(0, servingLen));
    if (servingG < 5 || servingG > 650) continue;

    const rest = cleaned.slice(servingLen);
    for (const calLen of [3, 4, 2, 1]) {
      if (calLen >= rest.length) continue;
      const calories = Number(rest.slice(0, calLen));
      if (calories > 2000 || calories < 1) continue;
      if (servingG > 50 && calories < 80) continue;
      if (servingG < 40 && calories > 300) continue;

      const parsed = parseKnownCalTail(rest.slice(calLen), calories);
      if (!parsed) continue;

      let score = scoreRow(calories, parsed.tail);
      if (servingG >= 200 && servingG <= 600 && calories >= 400) score += 3;
      if (servingG >= 50 && servingG <= 120 && calories >= 200 && calories <= 350) {
        score += 3;
      }
      if (servingG <= 60 && calories >= 150 && calories <= 350) score += 2;
      if (servingG >= 180 && calories >= 500) score += 4;
      if (parsed.tail[5] >= 40 && servingG < 100) score -= 20;

      if (score > bestScore) {
        bestScore = score;
        best = { servingG, ...parsed };
      }
    }
  }

  return best;
}

function splitItemLine(line) {
  const cleaned = line.replace(/•+$/g, "").trim();
  const match = cleaned.match(/^(.+?)(\d[\d.<]+)$/);
  if (!match || match[1].length < 2) return null;

  const parsed = parseItemDigits(match[2]);
  if (!parsed) return null;

  return {
    name: decodeName(match[1]),
    servingG: parsed.servingG,
    calories: parsed.calories,
    tail: parsed.tail,
  };
}

function normalizeLines(text) {
  const raw = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const merged = [];
  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    if (SKIP_RE.test(line) || /^•+$/.test(line)) continue;

    if (CATEGORY_RE.test(line)) {
      merged.push(line.replace(/MIX-INS \(.*\)/, "MIX-INS"));
      continue;
    }

    while (i + 1 < raw.length) {
      const next = raw[i + 1];
      if (CATEGORY_RE.test(next) || SKIP_RE.test(next) || /^•+$/.test(next)) break;

      if (/^(®|™)$/.test(next)) {
        line += next;
        i += 1;
        continue;
      }

      if (splitItemLine(line)) break;

      if (/^[\d.<]+/.test(next)) {
        line += next;
        i += 1;
        continue;
      }

      if (/^[A-Za-z]/.test(next) && next.length < 40 && !splitItemLine(line + next)) {
        line += ` ${next}`;
        i += 1;
        continue;
      }

      break;
    }

    merged.push(line);
  }

  return merged;
}

export function scrapeFiveGuys(sourceFile = "fiveguys-nutrition.txt") {
  const text = readSource(sourceFile);
  const lines = normalizeLines(text);
  const itemsById = new Map();
  let category = "Menu";
  let sawOtherItems = false;
  let stopParsing = false;

  for (const line of lines) {
    if (stopParsing) continue;

    if (line.startsWith("Five Guys Enterprises")) {
      stopParsing = true;
      continue;
    }

    if (line === "OTHER ITEMS") {
      sawOtherItems = true;
      category = "OTHER ITEMS";
      continue;
    }

    if (sawOtherItems && line === "MEAT") {
      stopParsing = true;
      continue;
    }

    if (CATEGORY_RE.test(line)) {
      category = line.replace(/FRIES - COOKED IN 100% PEANUT OIL/, "FRIES");
      continue;
    }

    const parsed = splitItemLine(line);
    if (!parsed?.name) continue;

    const patch = PATCHES[parsed.name];
    const nutrients = patch
      ? patch.nutrients
      : nutrientsFromRow(parsed.calories, parsed.tail);
    if (!nutrients) continue;

    const item = makeItem({
      chainId: CHAIN_ID,
      name: parsed.name,
      category,
      servingSize: `${patch?.servingG ?? parsed.servingG} g`,
      servingSizeG: patch?.servingG ?? parsed.servingG,
      nutrients,
    });

    if (!itemsById.has(item.id)) itemsById.set(item.id, item);
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Five Guys",
    source: SOURCE,
    syncedAt: new Date().toISOString(),
    items: [...itemsById.values()],
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeFiveGuys();
