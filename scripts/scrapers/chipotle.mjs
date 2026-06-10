import {
  makeItem,
  nutrientsFromStandardRow,
  readSource,
  writeChain,
} from "./_shared.mjs";

const CHAIN_ID = "chipotle";
const SOURCE =
  "chipotle.com/content/dam/chipotle/menu/nutrition/US-Nutrition-Facts-Paper-Menu-3-2025.pdf";

function parsePortionLine(line) {
  const m = line.match(/^([\d.]+\s*(?:fl\s+)?oz|[\d.]+\s*ea)\s*(.*)$/i);
  if (!m) return null;
  const servingSize = m[1].trim().replace(/\s+/g, " ");
  const nums = parseChipotleNutrition(m[2]);
  if (!nums) return null;
  const nutrients = nutrientsFromStandardRow(nums);
  if (!nutrients) return null;
  return { servingSize, nutrients };
}

/** Chipotle PDF glues portion size to calories (e.g. `1 ea` + `7025…` = 70 cal). */
function parseChipotleNutrition(text) {
  const cleaned = text.replace(/<\s*1/g, "0").replace(/\s/g, "").replace(/[XYx]+$/g, "");
  if (!cleaned) return null;

  let best = null;
  let bestScore = -Infinity;

  for (let calLen = 1; calLen <= 4; calLen++) {
    if (calLen >= cleaned.length) continue;
    const calStr = cleaned.slice(0, calLen);
    if (!/^\d+$/.test(calStr)) continue;
    const calories = Number(calStr);
    if (calories > 1500) continue;

    for (const tail of parseChipotleTail(cleaned.slice(calLen))) {
      if (tail[0] > calories) continue;
      const nums = [calories, ...tail];
      const score = scoreChipotleRow(nums);
      if (score > bestScore) {
        bestScore = score;
        best = nums;
      }
    }
  }

  return best;
}

const TAIL_MAX = [250, 90, 40, 5, 500, 4500, 250, 30, 120, 90];

function parseChipotleTail(rest, index = 0, acc = [], out = []) {
  if (index === 10) {
    if (rest.length === 0) out.push(acc);
    return out;
  }
  if (!rest.length) return out;

  const tryValue = (val, len) => {
    if (val < 0 || val > TAIL_MAX[index]) return;
    if (index === 0 && acc.length === 0) {
      // cal from fat checked against calories later
    }
    parseChipotleTail(rest.slice(len), index + 1, [...acc, val], out);
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

function scoreChipotleRow(nums) {
  const [cal, calFromFat, fat, sat, trans, chol, sodium, carbs, fiber, sugar, protein] = nums;
  let score = 0;
  if (cal >= 0 && cal <= 1500) score += 12;
  if (calFromFat <= cal) score += 8;
  if (fat >= 0 && fat <= 90) score += 5;
  if (sat <= fat + 0.01) score += 3;
  if (sodium >= 0 && sodium <= 4000) score += 5;
  if (carbs >= 0 && carbs <= 200) score += 4;
  if (protein >= 0 && protein <= 80) score += 5;
  if (fiber <= carbs + 0.01) score += 2;
  if (sugar <= carbs + 0.01) score += 2;

  const macroCal = fat * 9 + protein * 4 + carbs * 4;
  if (macroCal > cal * 1.6) score -= 20;
  if (cal < 40 && macroCal > cal * 1.2) score -= 15;
  if (protein >= 15 && sodium < 100) score -= 15;
  if (fat >= 5 && calFromFat < fat * 7) score -= 12;
  if (fat < 2 && calFromFat > 40) score -= 12;
  if (sat >= 3 && fat < sat) score -= 12;

  return score;
}

function extractMainNutritionTable(text) {
  const marker = "PortionCaloriesCalories From Fat";
  const start = text.indexOf(marker);
  if (start === -1) throw new Error("Chipotle nutrition table not found");

  const lines = text.slice(start).split("\n");
  const end = lines.findIndex(
    (line, idx) => idx > 0 && (line.includes("kids Menu") || line.includes(marker)),
  );
  return end === -1 ? lines : lines.slice(0, end);
}

export function scrapeChipotle(sourceFile = "chipotle.txt") {
  const text = readSource(sourceFile);
  const section = extractMainNutritionTable(text);
  const itemsById = new Map();
  let category = "Ingredients";

  for (let i = 1; i < section.length - 1; i++) {
    const name = section[i].trim();
    const dataLine = section[i + 1]?.trim() ?? "";
    if (!name || name.length < 2) continue;
    if (/^Portion|^nutrition|^Offerings|^©|^2,000|^facts$/i.test(name)) continue;
    if (/^[A-Z][A-Z\s&]+$/.test(name) && name.length < 40) {
      category = name.replace(/\s+/g, " ");
      continue;
    }

    const parsed = parsePortionLine(dataLine);
    if (!parsed) continue;

    const ozMatch = parsed.servingSize.match(/([\d.]+)\s*oz/i);
    const servingG = ozMatch ? Number(ozMatch[1]) * 28.35 : 100;

    const item = makeItem({
      chainId: CHAIN_ID,
      name,
      category,
      servingSize: parsed.servingSize,
      servingSizeG: servingG,
      nutrients: parsed.nutrients,
    });

    if (!itemsById.has(item.id)) itemsById.set(item.id, item);
    i++;
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Chipotle",
    source: SOURCE,
    syncedAt: new Date().toISOString(),
    items: [...itemsById.values()],
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeChipotle();
