import { makeItem, readSource, writeChain } from "./_shared.mjs";

const CHAIN_ID = "cook-out";
const SOURCE = "cookout.com/wp-content/uploads/Cook-Out-Nutrition1.pdf";

const FIELD_MAX = [2500, 90, 40, 5, 500, 5000, 300, 50, 200, 100];

const PATCHES = {
  "Big Double™": {
    nutrients: {
      calories: 601,
      fat_g: 31,
      saturated_fat_g: 13,
      trans_fat_g: 4,
      cholesterol_mg: 160,
      sodium_mg: 1262,
      carbs_g: 70,
      fiber_g: 0,
      sugar_g: 42,
      protein_g: 42,
    },
  },
};

const SKIP_LINE =
  /^(SERVING SIZE|Calories as served|TOTAL FAT|SATURATED|TRANS FAT|CHOLESTEROL|SODIUM|CARBOHYDRATES|DIETARY FIBER|SUGAR|PROTEIN|VITAMIN|CALCIUM|IRON)/i;

const HEADER_LINE = /SERVING SIZE.*Calories as served/i;

const MENU_HEADER =
  /^(Quesadillas|Crispy Chicken Wraps|Fresh Homemade|Hot Crispy|Chopped Pork|Char-Grilled Hot Dogs|Nutrition Facts|Homemade Style Chicken Strips|Sides\/Other Menu Items|Beverages|Fancy Milkshakes)$/i;

const SIDES_NAME =
  /^(Cheese|Chicken|Beef|Onion Rings|Chicken Nuggets|BLT|Bacon Ranch Wrap|Corn Dog|Cheese Dog|Mustard Relish Hot Dog|Side of|Hushpuppies|Large Fries|Regular Fries|Cook Out Fries|Okra|Cook Out Rounds|Cheese Curds)/i;

function decodeName(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/StyleAdd/gi, " Style Add")
    .replace(/EverythingAdd/gi, "Everything Add")
    .replace(/®/g, "®")
    .replace(/™/g, "™")
    .trim();
}

function cleanDigits(raw) {
  return raw.replace(/\s/g, "").replace(/\.(?=\d{3,})/g, "");
}

function isDigitFragment(line) {
  const cleaned = cleanDigits(line);
  return cleaned.length >= 1 && /^[\d.]+$/.test(line.replace(/\s/g, ""));
}

function isBurgerSizeName(line) {
  return /^(Small|Regular|Huge|Big Double)/i.test(line) && /lb/i.test(line);
}

function isServingLine(line) {
  if (isBurgerSizeName(line)) return false;
  return (
    /\(\s*[\d.]+\s*g\s*\)/i.test(line) ||
    /^(Huge|Large|Regular|Small)\d/i.test(line) ||
    (/^\d+\.?\d*\s*oz/i.test(line) && !/lb/i.test(line))
  );
}

function parseServingG(line) {
  const gMatch = line.match(/\(([\d.]+)\s*g\)/i);
  if (gMatch) return Number(gMatch[1]);
  const ozMatch = line.match(/([\d.]+)\s*oz/i);
  if (ozMatch) return Math.round(Number(ozMatch[1]) * 28.35);
  return 150;
}

function scoreFields(fields, context = {}) {
  const [cal, fat, sat, trans, chol, sodium, carbs, fiber, sugar, protein] = fields;
  const { name = "", category = "" } = context;
  let score = 0;
  if (cal >= 0 && cal <= 2500) score += 8;
  if (sat <= fat + 0.01) score += 4;
  if (trans <= fat + 0.01) score += 2;
  if (fiber <= carbs + 0.01) score += 2;
  if (sodium >= 0 && sodium <= 5000) score += 4;
  if (protein >= 0 && protein <= 100) score += 4;
  if (carbs >= 0 && carbs <= 300) score += 3;
  const macroCal = fat * 9 + protein * 4 + carbs * 4;
  score -= Math.abs(macroCal - cal) / 3;
  if (cal >= 400 && protein >= 15) score += 4;
  if (cal >= 400 && carbs >= 35) score += 4;
  if (cal <= 150 && fat <= 20) score += 2;
  if (cal < 400 && protein > 22) score -= 25;
  if (cal >= 200 && protein < 8 && fat < 12 && category !== "Beverages") score -= 10;
  if (cal >= 500 && fat >= 20 && sat >= 3) score += 3;
  if (chol > 150 && cal < 350) score -= 20;
  if (sodium < 100 && cal > 250 && category !== "Beverages") score -= 15;
  if (fiber > 12 && /burger|fries|dog|nugget|ring/i.test(name)) score -= 20;
  if (protein > 20 && /fries|rounds|okra|hush/i.test(name)) score -= 25;
  if (cal < 120 && /hot dog|burger|fries|sandwich|wrap|shake|dog|nugget|ring|corn/i.test(name)) {
    score -= 30;
  }
  if (sugar > 30 && cal < 150 && category !== "Beverages" && category !== "Fancy Milkshakes") {
    score -= 25;
  }
  if (cal >= 200 && protein === 0 && /burger|dog|chicken|strip|sandwich|wrap/i.test(name)) {
    score -= 30;
  }
  if (category === "Beverages" && cal >= 50 && carbs >= 20 && sugar >= 10) score += 8;
  if (category === "Fancy Milkshakes" && cal >= 400 && fat >= 10 && sugar >= 40) score += 6;
  return score;
}

function parseBeverageDigits(digits) {
  const cleaned = cleanDigits(digits);

  if (/^0{3,}/.test(cleaned)) {
    return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  }

  const zeroHeavy = cleaned.match(/^(\d{2,3})(0{4,})(\d.*)$/);
  if (zeroHeavy) {
    const cal = Number(zeroHeavy[1]);
    const chunks = zeroHeavy[3]
      .split(/0+/)
      .filter(Boolean)
      .map(Number)
      .filter((n) => n > 0 && n <= 120);
    if (cal >= 0 && cal <= 500 && chunks.length >= 1) {
      const carbs = chunks[0];
      const sugar = chunks[1] ?? carbs;
      return [cal, 0, 0, 0, 0, 0, carbs, 0, sugar, 0];
    }
  }

  return null;
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

  if ([1, 2].includes(index)) {
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

function parseNutritionDigits(digits, context = {}) {
  const beverage = parseBeverageDigits(digits);
  if (beverage) return beverage;

  let best = null;
  let bestScore = -Infinity;
  const cleaned = cleanDigits(digits);

  for (const strip of [0, 4, 6, 8]) {
    const trimmed = strip ? cleaned.slice(0, -strip) : cleaned;
    if (trimmed.length < 10) continue;

    for (const calLen of [3, 2, 4, 1]) {
      if (calLen >= trimmed.length) continue;
      const cal = Number(trimmed.slice(0, calLen));
      const rest = trimmed.slice(calLen);
      for (const fields of parseTail(rest, 1, [cal])) {
        if (fields.length !== 10) continue;
        const score = scoreFields(fields, context);
        if (score > bestScore) {
          bestScore = score;
          best = fields;
        }
      }
    }

    for (const fields of parseTail(trimmed)) {
      const score = scoreFields(fields, context);
      if (score > bestScore) {
        bestScore = score;
        best = fields;
      }
    }
  }

  return best;
}

function normalizeLines(text) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .flatMap((line) => {
      if (HEADER_LINE.test(line)) return [];
      if (/^(®|™)$/.test(line)) return [];
      return [line];
    });
}

function inferCategory(name, current) {
  if (/^Coca-Cola|^Diet Coke|^Sprite|^Pibb|^Mellow Yellow|^Fanta|^Hi-C|^Fresh Brewed|^Dr\. Pepper|^Cheerwine|^Powerade|Float$/i.test(name)) {
    return "Beverages";
  }
  if (/^Vanilla$|^Hershey|^Strawberry|^Fresh Banana|^Banana |^Blueberry|^Chocolate|^Red Cherry|^Fresh Peanut|^Peanut Butter|^Cappuccino|^Caramel|^Pineapple|^Snickers|^Walnut|^Oreo|^M&M|^Peach|^Mocha|^Peach Cobbler|^Reese|^Orange Push|^Cherry Cobbler|^Chocolate Malt|^Heath|^Cherry Cheesecake|^Double Chocolate|^Fresh Watermelon|^Philadelphia|^Nilla|^Mint$|^Malted Milk|^Fudge$/i.test(name)) {
    return "Fancy Milkshakes";
  }
  if (SIDES_NAME.test(name)) return "Sides";
  return current;
}

function parseCookOutText(text) {
  const lines = normalizeLines(text);
  const itemsById = new Map();
  let category = "Burgers";

  let name = null;
  let serving = null;
  let digits = null;
  let lastItemName = null;
  let isSizeVariant = false;

  function reset() {
    name = null;
    serving = null;
    digits = null;
    isSizeVariant = false;
  }

  function displayNameFor(decodedName) {
    const size = serving?.match(/^(Small|Regular|Huge|Large)\b/i)?.[1];
    if (category === "Beverages" && size) return `${decodedName} (${size})`;
    if (isSizeVariant && size) return `${decodedName} (${size})`;
    return decodedName;
  }

  function flush() {
    if (!name || !digits) return;

    const decodedName = decodeName(name);
    const itemName = displayNameFor(decodedName);
    const patch = PATCHES[decodedName];
    const fields = patch?.nutrients
      ? [
          patch.nutrients.calories,
          patch.nutrients.fat_g,
          patch.nutrients.saturated_fat_g,
          patch.nutrients.trans_fat_g,
          patch.nutrients.cholesterol_mg,
          patch.nutrients.sodium_mg,
          patch.nutrients.carbs_g,
          patch.nutrients.fiber_g,
          patch.nutrients.sugar_g,
          patch.nutrients.protein_g,
        ]
      : parseNutritionDigits(digits, { name: decodedName, category });
    if (!fields) {
      reset();
      return;
    }

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
    ] = fields;

    const item = makeItem({
      chainId: CHAIN_ID,
      name: itemName,
      category,
      servingSize: serving ?? "1 serving",
      servingSizeG: patch?.servingG ?? parseServingG(serving ?? ""),
      nutrients: patch?.nutrients ?? {
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
    });

    if (!itemsById.has(item.id)) itemsById.set(item.id, item);
    lastItemName = decodedName;
    reset();
    return;
  }

  function startVariantServing(line) {
    if (!name && lastItemName) {
      name = lastItemName;
      isSizeVariant = true;
    }
    const sizePrefix = line.match(/^(Small|Regular|Huge|Large)\b/i)?.[0];
    const prevSize = serving?.match(/^(Small|Regular|Huge|Big Double|Large)/i)?.[0];
    if (sizePrefix && !/\d+\.?\d*\s*oz/i.test(line) && !/\(\s*[\d.]+\s*g/i.test(line)) {
      serving = line;
    } else if (prevSize && !sizePrefix && /\d+\.?\d*\s*oz/i.test(line)) {
      serving = `${serving} · ${line}`;
    } else {
      serving = line.replace(/^(Huge|Large|Regular|Small)(?=\d)/i, "$1 ");
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (MENU_HEADER.test(line)) {
      flush();
      if (/^Sides/i.test(line)) category = "Sides";
      else if (/^Beverages/i.test(line)) category = "Beverages";
      else if (/^Fancy Milkshakes/i.test(line)) category = "Fancy Milkshakes";
      continue;
    }

    if (SKIP_LINE.test(line)) continue;

    if (name && serving && isDigitFragment(line)) {
      digits = digits ? digits + cleanDigits(line) : cleanDigits(line);
      while (i + 1 < lines.length && isDigitFragment(lines[i + 1])) {
        digits += cleanDigits(lines[++i]);
      }
      flush();
      continue;
    }

    if (isBurgerSizeName(line)) {
      flush();
      name = line;
      category = "Burgers";
      continue;
    }

    if (isServingLine(line)) {
      flush();
      startVariantServing(line);
      continue;
    }

    if (/^Add$/i.test(line) && name) {
      name = `${name} Add`;
      continue;
    }

    if (/^StyleAdd$/i.test(line)) {
      name = name ? `${name} Style Add` : "Style Add";
      continue;
    }

    if (/^\d+$/.test(cleanDigits(line))) continue;

    flush();

    if (line.length > 1) {
      name = line;
      category = inferCategory(line, category);
    }
  }

  flush();
  return [...itemsById.values()];
}

export function scrapeCookOut(sourceFile = "cookout-nutrition.txt") {
  const text = readSource(sourceFile);
  const items = parseCookOutText(text);

  return writeChain({
    id: CHAIN_ID,
    name: "Cook Out",
    source: SOURCE,
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeCookOut();
