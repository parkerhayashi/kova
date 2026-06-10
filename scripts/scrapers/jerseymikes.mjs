import { makeItem, readSource, writeChain } from "./_shared.mjs";

const CHAIN_ID = "jersey-mikes";
const SOURCE = "jerseymikes.ca/nutrition?type=nutrition";

const FIELD_MAX = [2500, 150, 50, 5, 200, 25, 50, 120, 350, 8000];

const SECTIONS = {
  MINI: "Mini",
  "REGULAR COLD": "Regular Cold",
  "Regular Mike's (Hot)": "Regular Hot",
  "Giant Mike's (Cold)": "Giant Cold",
  "GIANT HOT": "Giant Hot",
  "KID'S MENU": "Kid's Menu",
  DESSERTS: "Desserts",
  "Mini Extra's": "Mini Extras",
  "Regular Extra's": "Regular Extras",
  "Giant Extra's": "Giant Extras",
};

const SKIP_LINE =
  /^(Jersey Mike's Menu Label Report|The average adult requires|Please Note:|Disclaimer:|Page \d+ of \d+|QuantityMeasureCalories|Cornmeal is used)/i;

function decodeName(text) {
  return text.replace(/\s+/g, " ").replace(/\s*-\s*/g, " - ").trim();
}

function parseServingG(name) {
  if (/mini/i.test(name)) return 150;
  if (/giant|GIANT/i.test(name)) return 700;
  if (/tub|chopped|bowl/i.test(name)) return 250;
  if (/wrap/i.test(name)) return 320;
  if (/kid/i.test(name)) return 180;
  if (/cookie|brownie/i.test(name)) return 60;
  if (/regular|hot regular/i.test(name)) return 350;
  return 250;
}

function scoreFields(fields) {
  const [cal, fat, sat, trans, carbs, fiber, sugar, protein, chol, sodium] = fields;
  let score = 0;
  if (cal >= 0 && cal <= 2500) score += 8;
  if (sat <= fat + 0.01) score += 4;
  if (trans <= fat + 0.01) score += 2;
  if (fiber <= carbs + 0.01) score += 2;
  if (sodium >= 0 && sodium <= 8000) score += 4;
  if (protein >= 0 && protein <= 120) score += 4;
  if (carbs >= 0 && carbs <= 200) score += 3;
  const macroCal = fat * 9 + protein * 4 + carbs * 4;
  score -= Math.abs(macroCal - cal) / 4;
  if (cal >= 500 && protein >= 20) score += 3;
  return score;
}

function parseTail(rest, index = 0, acc = [], out = []) {
  if (index === 10) {
    if (rest.length === 0) out.push(acc);
    return out;
  }
  if (!rest.length) return out;

  const tryValue = (val, len) => {
    if (val < 0 || val > FIELD_MAX[index]) return;
    parseTail(rest.slice(len), index + 1, [...acc, val], out);
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

function parseNutritionTail(raw) {
  const cleaned = raw.replace(/[\s,]/g, "");
  let best = null;
  let bestScore = -Infinity;

  for (const fields of parseTail(cleaned)) {
    const score = scoreFields(fields);
    if (score > bestScore) {
      bestScore = score;
      best = fields;
    }
  }

  return best;
}

function extractSpacedNumbers(raw) {
  return [...raw.matchAll(/[\d,]+(?:\.\d+)?/g)]
    .map((m) => Number(m[0].replace(/,/g, "")))
    .filter((n) => !Number.isNaN(n));
}

function parseNutritionPart(raw) {
  const spaced = extractSpacedNumbers(raw);
  if (spaced.length >= 10) return spaced.slice(0, 10);

  const tail = parseNutritionTail(raw);
  if (tail) return tail;

  return spaced.length >= 8 ? spaced : null;
}

function normalizeText(text) {
  return text
    .replace(/\r/g, "")
    .replace(/Page \d+ of \d+/gi, "\n")
    .replace(/Jersey Mike's Menu Label Report[^\n]*/gi, "\n")
    .replace(/QuantityMeasureCalories[^\n]*/gi, "\n")
    .replace(/1\s*\n\s*Serving/gi, "1Serving")
    .replace(/1\s+Serving/gi, "1Serving")
    .replace(/1Each/gi, "1Serving")
    .replace(/\u00a0/g, " ");
}

function isSectionLine(line) {
  const trimmed = line.trim();
  return Object.keys(SECTIONS).some(
    (key) => trimmed.toUpperCase() === key.toUpperCase() || trimmed.startsWith(key),
  );
}

function sectionFor(line) {
  const trimmed = line.trim();
  for (const [key, value] of Object.entries(SECTIONS)) {
    if (trimmed.toUpperCase().startsWith(key.toUpperCase())) return value;
  }
  return null;
}

function isItemStart(line) {
  return (
    /^#\d+/i.test(line) ||
    /^(Chocolate|Mini Chocolate|Add |Add\/|Extra |Salami|#?\d+ - (Mini|Regular|Giant) Extra)/i.test(
      line.trim(),
    )
  );
}

function parseRecord(buffer, category) {
  const match = buffer.match(/^(.+?)1Serving([\s\S]+)$/i);
  if (!match) return null;

  const name = decodeName(match[1]);
  const fields = parseNutritionPart(match[2]);
  if (!fields || fields.length < 10) return null;

  const [
    calories,
    fat_g,
    saturated_fat_g,
    trans_fat_g,
    carbs_g,
    fiber_g,
    sugar_g,
    protein_g,
    cholesterol_mg,
    sodium_mg,
  ] = fields;

  if (calories <= 0) return null;

  return makeItem({
    chainId: CHAIN_ID,
    name,
    category,
    servingSize: "1 serving",
    servingSizeG: parseServingG(name),
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
    tags: [/mike's way/i.test(name) ? "mikes-way" : /mike's cold/i.test(name) ? "mikes-cold" : null].filter(
      Boolean,
    ),
  });
}

function parseJerseyMikesText(text) {
  const lines = normalizeText(text)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const itemsById = new Map();
  let category = "Subs";
  let buffer = null;

  function flush() {
    if (!buffer) return;
    const item = parseRecord(buffer, category);
    if (item && !itemsById.has(item.id)) itemsById.set(item.id, item);
    buffer = null;
  }

  for (const line of lines) {
    if (SKIP_LINE.test(line)) continue;

    const section = sectionFor(line);
    if (section) {
      flush();
      category = section;
      continue;
    }

    if (isItemStart(line)) {
      flush();
      buffer = line;
      continue;
    }

    if (!buffer) {
      if (/1Serving/i.test(line)) buffer = line;
      continue;
    }

    if (isItemStart(line)) {
      flush();
      buffer = line;
      continue;
    }

    buffer += ` ${line}`;

    if (/1Serving/i.test(buffer)) {
      const item = parseRecord(buffer, category);
      if (item) {
        if (!itemsById.has(item.id)) itemsById.set(item.id, item);
        buffer = null;
      }
    }
  }

  flush();
  return [...itemsById.values()];
}

export function scrapeJerseyMikes(sourceFile = "jerseymikes-ca-nutrition.txt") {
  const text = readSource(sourceFile);
  const items = parseJerseyMikesText(text);

  return writeChain({
    id: CHAIN_ID,
    name: "Jersey Mike's",
    source: SOURCE,
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeJerseyMikes();
