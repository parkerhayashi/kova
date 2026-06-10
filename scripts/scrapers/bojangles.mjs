import { makeItem, readSource, writeChain } from "./_shared.mjs";

const CHAIN_ID = "bojangles";
const SOURCE =
  "bojanglesrdu.com/wp-content/uploads/2017/04/bojangles-nutrition.pdf";

const CATEGORY_RE =
  /^(BISCUITS|SANDWICHES|SALADS|SWEETS|KIDS’ MEAL|CHICKEN|FIXIN’S|DIPPING SAUCES|SALAD DRESSING|DRINKS|LEGENDARY ICED TEA)/;

const SKIP_RE =
  /^(Serving Size|Calories|Allergens|Nutrition Facts|©|MENU NUTRITION|The above|Fish|Milk|Peanut|Shellfish|Soy|Treenuts|Wheat|Egg$|\* Only at|BOJ-|xxx$)/;

const SERVING_TOKEN =
  "(?:Ind\\.|Picnic|Pic(?=\\d)|Sm|Small|Medium|Regular|Large|\\d+\\.?\\d*\\s*fl\\s*oz|\\d+\\.?\\d*\\s*oz|\\d+\\s*pc|\\d+\\s*Bowl|1\\/2\\s*Gal|1\\/2\\s*oz|\\(\\d+oz\\))";

const TAIL_MAX = [500, 90, 40, 5, 500, 250, 5000, 120, 90, 40];

function decodeName(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\*+$/, "")
    .replace(/®/g, "®")
    .replace(/™/g, "™")
    .trim();
}

function nutrientsFromRow(calories, tail) {
  if (tail.length !== 10) return null;
  const [
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
  const [calFromFat, fat, sat, trans, chol, carbs, sodium, sugar, protein, fiber] =
    tail;
  let score = 0;
  if (calFromFat <= totalCal) score += 8;
  if (sat <= fat + 0.01) score += 4;
  if (trans <= fat + 0.01) score += 2;
  if (fiber <= carbs + 0.01) score += 2;
  if (sodium >= 0 && sodium <= 5000) score += 4;
  if (protein >= 0 && protein <= 90) score += 4;
  if (carbs >= 0 && carbs <= 250) score += 3;
  const macroCal = fat * 9 + protein * 4 + carbs * 4;
  score -= Math.abs(macroCal - totalCal) / 3;
  if (fat >= 3) score -= Math.abs(calFromFat - fat * 9) / 5;
  if (protein > 25 && totalCal < 450) score -= (protein - 25) * 2;
  if (sodium < 50 && totalCal > 200) score -= 8;
  if (totalCal >= 400 && protein < 10) score -= 25;
  if (totalCal >= 400 && protein >= 15) score += 8;
  if (totalCal >= 400 && sodium >= 800) score += 4;
  if (fat >= 8 && carbs < 5 && totalCal >= 120) score -= 15;
  if (sodium >= 100 && sodium <= 4000) score += 3;
  if (sodium > 1200 && totalCal < 250) score -= 20;
  if (protein > 30 && carbs < 15 && totalCal > 400) score -= 20;
  if (totalCal >= 500 && fat >= 25 && carbs < 20) score -= 15;
  if (totalCal >= 500 && carbs >= 40) score += 5;
  return score;
}

function parseKnownCalTail(rest, calories) {
  const cleaned = rest.replace(/\s/g, "").replace(/x+$/i, "").replace(/[XYx]+$/g, "");
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

function parseNutritionDigits(rest) {
  const cleaned = rest.replace(/\s/g, "").replace(/x+$/i, "").replace(/[XYx]+$/g, "");
  if (!cleaned) return null;

  let best = null;
  let bestScore = -Infinity;

  for (let calLen = 1; calLen <= 4; calLen++) {
    if (calLen >= cleaned.length) continue;
    const calories = Number(cleaned.slice(0, calLen));
    if (calories > 2000) continue;

    for (const tail of parseTail(cleaned.slice(calLen), calories)) {
      const score = scoreRow(calories, tail);
      if (score > bestScore) {
        bestScore = score;
        best = { calories, tail };
      }
    }
  }

  return best;
}

function splitItemLine(line) {
  const cleaned = line
    .replace(/x+$/i, "")
    .replace(/(Ind\.|Picnic|Pic)\s+(?=\d)/gi, "$1")
    .trim();
  if (!cleaned || !/\d/.test(cleaned)) return null;

  const servingMatch = cleaned.match(
    new RegExp(`^(.+?)(${SERVING_TOKEN})\\s*([\\d.]+)$`, "i"),
  );
  if (servingMatch) {
    const digits = servingMatch[3];
    let parsed = null;
    if (digits.length >= 6) {
      const cal3 = Number(digits.slice(0, 3));
      if (cal3 >= 100 && cal3 <= 999) {
        parsed = parseKnownCalTail(digits.slice(3), cal3);
      }
    }
    if (!parsed) parsed = parseNutritionDigits(digits);
    if (!parsed) return null;
    return {
      name: decodeName(servingMatch[1]),
      servingSize: servingMatch[2].trim(),
      ...parsed,
    };
  }

  const oneCalMatch = cleaned.match(/^(.+?)1(\d{3})([\d.]+)$/);
  if (oneCalMatch) {
    const parsed = parseKnownCalTail(oneCalMatch[3], Number(oneCalMatch[2]));
    if (!parsed) return null;
    return {
      name: decodeName(oneCalMatch[1]),
      servingSize: "1",
      ...parsed,
    };
  }

  const fallback = cleaned.match(/^(.+?)([\d.]{4,})$/);
  if (!fallback || fallback[1].length < 3) return null;
  const parsed = parseNutritionDigits(fallback[2]);
  if (!parsed) return null;
  return {
    name: decodeName(fallback[1]),
    servingSize: "1 serving",
    ...parsed,
  };
}

function isNameLine(line) {
  return (
    /^[A-Za-z]/.test(line) &&
    !/\d/.test(line) &&
    !new RegExp(`^${SERVING_TOKEN}`, "i").test(line)
  );
}

function normalizeLines(text) {
  const raw = text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const merged = [];
  let pendingName = null;

  for (let i = 0; i < raw.length; i++) {
    let line = raw[i];
    if (SKIP_RE.test(line) || line === "xxx") continue;

    if (CATEGORY_RE.test(line)) {
      merged.push(line.replace(/SALADSNot included:.*/, "SALADS"));
      pendingName = null;
      continue;
    }

    if (/^(®|™)$/.test(line)) {
      if (pendingName) pendingName += line;
      continue;
    }

    if (isNameLine(line)) {
      pendingName = line;
      while (i + 1 < raw.length && /^(®|™)$/.test(raw[i + 1])) {
        pendingName += raw[++i];
      }
      continue;
    }

    let row = line;
    if (pendingName) {
      if (new RegExp(`^${SERVING_TOKEN}`, "i").test(line)) {
        row = `${pendingName} ${line}`;
      } else if (/^[\d.]+/.test(line)) {
        row = `${pendingName}${line}`;
      } else if (/^[A-Za-z]/.test(line) && !/\d/.test(line)) {
        pendingName = `${pendingName} ${line}`.replace(/\s+/g, " ").trim();
        continue;
      } else if (/^[A-Za-z]/.test(line)) {
        row = `${pendingName} ${line}`.replace(/\s+/g, " ").trim();
      }
    }

    while (i + 1 < raw.length) {
      const next = raw[i + 1];
      if (CATEGORY_RE.test(next) || SKIP_RE.test(next) || next === "xxx") break;
      if (/^(®|™)$/.test(next)) {
        row += next;
        i += 1;
        continue;
      }
      if (splitItemLine(row)) break;
      if (/^[\d.]+x*$/i.test(next)) {
        row += next;
        i += 1;
        continue;
      }
      if (isNameLine(next) || new RegExp(`^${SERVING_TOKEN}`, "i").test(next)) break;
      break;
    }

    if (!splitItemLine(row)) continue;

    merged.push(row);
    pendingName = null;
  }

  return merged;
}

export function scrapeBojangles(sourceFile = "bojangles-nutrition.txt") {
  const text = readSource(sourceFile);
  const lines = normalizeLines(text);
  const itemsById = new Map();
  let category = "Menu";

  for (const line of lines) {
    if (CATEGORY_RE.test(line)) {
      category = line.replace(/SALADS.*/, "Salads").replace(/KIDS’ MEAL.*/, "Kids Meal");
      continue;
    }

    const parsed = splitItemLine(line);
    if (!parsed?.name || parsed.name.length < 2) continue;
    if (/^(Ind\.|Picnic|Sm|Small|Medium|Regular|Large)$/i.test(parsed.name)) continue;
    if (/^Picnic\d/i.test(parsed.name) || /^Ind\.\d/i.test(parsed.name)) continue;

    const nutrients = nutrientsFromRow(parsed.calories, parsed.tail);
    if (!nutrients) continue;

    const displayName =
      parsed.servingSize !== "1" && parsed.servingSize !== "1 serving"
        ? `${parsed.name} (${parsed.servingSize})`
        : parsed.name;

    const item = makeItem({
      chainId: CHAIN_ID,
      name: displayName,
      category,
      servingSize: parsed.servingSize,
      servingSizeG: 150,
      nutrients,
    });

    if (!itemsById.has(item.id)) itemsById.set(item.id, item);
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Bojangles",
    source: SOURCE,
    syncedAt: new Date().toISOString(),
    items: [...itemsById.values()],
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeBojangles();
