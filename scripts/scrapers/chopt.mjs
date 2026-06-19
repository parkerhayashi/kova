import {
  makeItem,
  nutrientsFromStandardRow,
  parseConcatenatedNutrition,
  readSource,
  slugify,
  writeChain,
} from "./_shared.mjs";

const CHAIN_ID = "chopt";
const SOURCE =
  "https://assets.choptsalad.com/pdfs/web/chopt_nutrition_allergen_guide.pdf";

const CATEGORY_LINE =
  /^(SALADS|WRAPS|BOWLS|WARM BOWLS|SANDWICHES|SANDWICH\s+INGREDIENTS|CORE CHOPPINGS|GREENS|GRAINS & BEANS|CHEESE & DAIRY|CRUNCH|THE GOODS|HOUSEMADE DRESSINGS|PANTRY|SOUPS|BEVERAGES & SWEETS|FOUNTAIN BEVERAGES|SWEETS)$/i;

const DRESSING_SUBCATEGORY = /^(CLASSIC|CREATIVE|LIGHT)$/i;
const DRESSING_PORTION = /^(SALAD PORTIONS|BOWL PORTIONS)$/i;

const SKIP_LINE =
  /^(SERVING|SIZECALORIES|\(|G\)|MG\)|%DV\)|\)|UPDATED SPRING|SELECT LOCATIONS|NUTRITION|Nutritional|Your health|Consuming raw|CRAFT YOUR OWN|SALADS, WRAPS|SALADS & BOWLS|\*|SOUPS$|SEASONAL$|CHOLES|TEROL|SATURATED FAT|TOTAL FAT|TRANS FAT|TOTAL CARB|DIETARY FIBER|SUGARS|PROTEIN|VITAMIN|CALCIUM|IRON)$/i;

const ALLERGEN_HEADER = /^DAIRYEGGS/i;

const SERVING_TYPES =
  "salad|wrap|bowl|sandwich|roll|portion|soup|each";

function cleanDigits(raw) {
  return raw
    .replace(/\s/g, "")
    .replace(/----+/g, "0")
    .replace(/--+/g, "0")
    .replace(/[XYx]+$/g, "");
}

function isDigitFragment(line) {
  const cleaned = cleanDigits(line);
  return cleaned.length >= 1 && /^[\d.]+$/.test(cleaned);
}

function titleWord(word) {
  if (!word) return word;
  if (/^[A-Z0-9]+[-/][A-Z0-9]+$/i.test(word)) {
    return word
      .split(/([-/])/)
      .map((part) => (/^[-/]$/.test(part) ? part : titleWord(part)))
      .join("");
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function titleCaseName(raw) {
  return raw
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.endsWith("*")) return `${titleWord(word.slice(0, -1))}*`;
      if (/^(with|and|or|of|in)$/i.test(word)) return word.toLowerCase();
      if (word.includes("/")) {
        return word
          .split("/")
          .map((part) => titleWord(part))
          .join("/");
      }
      return titleWord(word);
    })
    .join(" ");
}

function cleanDisplayName(raw) {
  return titleCaseName(
    raw
      .replace(/^DAIRYEGGSFISHSHELLFISHPEANUTSTREE NUTSSESAMESOYGLUTENVEGANONIONGARLIC\s*/i, "")
      .replace(/^DAIRYEGGS\S*\s*/i, ""),
  );
}

function normalizeCategory(category, dressingPortion, dressingStyle) {
  if (/HOUSEMADE DRESSINGS/i.test(category)) {
    const parts = ["Dressings"];
    if (dressingPortion) parts.push(dressingPortion);
    if (dressingStyle) parts.push(dressingStyle);
    return parts.join(" — ");
  }
  if (/THE GOODS/i.test(category)) return "Proteins";
  if (/CHEESE & DAIRY/i.test(category)) return "Cheese & Dairy";
  if (/GRAINS & BEANS/i.test(category)) return "Grains & Beans";
  if (/BEVERAGES & SWEETS/i.test(category)) return "Beverages";
  return titleCaseName(category);
}

function macroCalDiff(nums) {
  const [cal, , fat, , , , , carbs, , , protein] = nums;
  const macroCal = protein * 4 + carbs * 4 + fat * 9;
  return Math.abs(macroCal - cal);
}

function scoreChoptRow(nums, context = {}) {
  const [cal, calFat, fat, sat, trans, chol, sodium, carbs, fiber, sugar, protein] =
    nums;
  let score = 0;

  if (cal >= 0 && cal <= 2500) score += 8;
  if (calFat <= cal + 5) score += 6;
  if (Math.abs(calFat - fat * 9) <= Math.max(20, fat * 3)) score += 22;
  if (fat >= sat - 0.01) score += 4;
  if (sat >= trans - 0.01) score += 2;
  if (fiber <= carbs + 1) score += 4;
  if (sugar <= carbs + 1) score += 3;
  if (sodium >= 0 && sodium <= 5000) score += 4;
  if (protein >= 0 && protein <= 100) score += 4;

  const macroDiff = macroCalDiff(nums);
  if (macroDiff <= Math.max(25, cal * 0.12)) score += 28;
  else if (macroDiff <= cal * 0.2) score += 12;
  else score -= Math.min(45, macroDiff / 8);

  if (context.dressing) {
    if (cal >= 20 && cal <= 350) score += 18;
    if (cal > 500) score -= 40;
    if (fat >= 0 && fat <= 30) score += 6;
  }

  if (context.beverage) {
    if (cal <= 350) score += 10;
    if (carbs >= sugar) score += 4;
  }

  if (context.proteinPortion) {
    if (cal >= 60 && cal <= 250) score += 16;
    if (cal > 350) score -= 50;
    if (protein >= 8 && protein <= 45) score += 10;
  }

  if (context.savory) {
    if (sugar <= 15) score += 10;
    if (sugar > 20) score -= 45;
    if (sugar > carbs) score -= 30;
    if (fiber <= 15) score += 4;
    if (fiber > 20) score -= 25;
    if (cal >= 400 && protein >= 12 && protein <= 50) score += 12;
    if (cal >= 400 && protein > 55) score -= 40;
    if (cal >= 400 && protein < 8) score -= 35;
    if (cal >= 400 && sodium >= 200) score += 6;
    if (cal >= 400 && sodium < 80) score -= 25;
  }

  if (cal <= 700 && chol > 120) score -= 18;
  if (cal <= 500 && protein > 45) score -= 20;
  if (cal >= 200 && carbs > 120) score -= 15;
  if (protein > 80) score -= 35;

  return score;
}

function compareChoptSolutions(a, b, context = {}) {
  const scoreDiff = scoreChoptRow(b, context) - scoreChoptRow(a, context);
  if (scoreDiff !== 0) return scoreDiff;

  const macroDiff = macroCalDiff(a) - macroCalDiff(b);
  if (macroDiff !== 0) return macroDiff;

  if (context.savory) {
    const sugarDiff = a[9] - b[9];
    if (sugarDiff !== 0) return sugarDiff;
    const fiberDiff = a[8] - b[8];
    if (fiberDiff !== 0) return fiberDiff;
  }

  return 0;
}

function parseChoptDigits(digits, context = {}) {
  const cleaned = cleanDigits(digits);
  if (!cleaned) return null;

  const solutions = [];

  function validField(index, value, acc) {
    if (value < 0) return false;
    if (index === 0 && value > 2500) return false;
    if (context.proteinPortion && index === 0 && value > 350) return false;
    if (index === 1 && acc[0] !== undefined && value > acc[0] + 5) return false;
    if (index === 2 && value > 70) return false;
    if (index === 3 && acc[2] !== undefined && value > acc[2] + 0.01) return false;
    if (index === 4 && value > 5) return false;
    if (index === 5 && value > 500) return false;
    if (index === 6 && value > 8000) return false;
    if (index === 7 && value > 600) return false;
    if (index === 8 && value > 100) return false;
    if (context.savory && index === 8 && value > 25) return false;
    if (index === 9 && value > 300) return false;
    if (context.savory && index === 9 && value > 25) return false;
    if (index === 10 && value > 100) return false;
    if (context.savory && index === 10 && value > 60) return false;
    if (context.dressing && index === 0 && value > 350) return false;
    return true;
  }

  function dfs(remaining, index, acc) {
    if (index === 11) {
      solutions.push([...acc]);
      return;
    }
    if (!remaining.length) return;

    const candidates = [];
    for (let len = Math.min(4, remaining.length); len >= 1; len--) {
      const chunk = remaining.slice(0, len);
      if (!/^\d+$/.test(chunk)) continue;
      candidates.push({ val: Number(chunk), len });
    }

    const dec = remaining.match(/^(\d+\.\d{1,2})/);
    if (dec && index !== 2) {
      candidates.push({ val: Number(dec[1]), len: dec[1].length });
    }

    for (const { val, len } of candidates) {
      if (!validField(index, val, acc)) continue;
      dfs(remaining.slice(len), index + 1, [...acc, val]);
    }
  }

  for (let strip = 0; strip <= 12; strip++) {
    dfs(cleaned.slice(0, cleaned.length - strip), 0, []);
  }

  if (!solutions.length) {
    const fallback = parseConcatenatedNutrition(cleaned, 11, {
      strictEnd: false,
    });
    return fallback.length >= 11 ? nutrientsFromStandardRow(fallback) : null;
  }

  solutions.sort((a, b) => compareChoptSolutions(a, b, context));
  return nutrientsFromStandardRow(solutions[0]);
}

function parseNutritionDigits(digits, context = {}) {
  return parseChoptDigits(digits, context);
}

function tryParseServingLine(line) {
  const inline = line.match(
    new RegExp(`^1\\s+(${SERVING_TYPES})(.*)$`, "i"),
  );
  if (inline) {
    return {
      servingLabel: `1 ${inline[1].toLowerCase()}`,
      digits: inline[2] ?? "",
    };
  }
  return null;
}

function tryParseSizeLine(line) {
  const inline = line.match(/^(\d+)\s*(g|oz)(.*)$/i);
  if (inline) {
    const amount = Number(inline[1]);
    const unit = inline[2].toLowerCase();
    return {
      servingLabel: `${amount}${unit}`,
      servingG: unit === "g" ? amount : Math.round(amount * 28.35),
      digits: inline[3] ?? "",
      profile: unit === "oz" ? "servingFirst" : "servingFirst",
    };
  }
  return null;
}

function tryParseCombinedNameLine(line) {
  const m = line.match(
    new RegExp(`^(.+?)(\\d+\\s*(?:g|oz)|1\\s+(?:${SERVING_TYPES}))(.+)$`, "i"),
  );
  if (!m) return null;
  const name = m[1].trim();
  const sizePart = m[2].replace(/\s/g, "");
  const digits = m[3];
  if (name.length < 2) return null;

  if (/^\d+(g|oz)$/i.test(sizePart)) {
    const size = sizePart.match(/^(\d+)(g|oz)$/i);
    return {
      name,
      servingLabel: `${size[1]}${size[2].toLowerCase()}`,
      servingG:
        size[2].toLowerCase() === "g"
          ? Number(size[1])
          : Math.round(Number(size[1]) * 28.35),
      digits,
      profile: "servingFirst",
    };
  }

  const serving = tryParseServingLine(`${sizePart}${digits}`);
  if (!serving) return null;
  return { name, ...serving, profile: "standard" };
}

function accumulateDigits(lines, startIdx, initialDigits = "", category = "") {
  let digits = initialDigits;
  let i = startIdx;

  while (i < lines.length) {
    const line = lines[i];
    if (CATEGORY_LINE.test(line) || DRESSING_SUBCATEGORY.test(line)) break;
    if (SKIP_LINE.test(line) || ALLERGEN_HEADER.test(line)) {
      i++;
      continue;
    }
    if (/^[A-Za-z]/.test(line) && !isDigitFragment(line)) break;

    if (line === "1" && lines[i + 1]?.match(new RegExp(`^1\\s+(?:${SERVING_TYPES})`, "i"))) {
      break;
    }

    if (isDigitFragment(line)) {
      digits += cleanDigits(line);
      i++;
      if (parseNutritionDigits(digits, nutritionContext(category, ""))) continue;
      continue;
    }

    const serving = tryParseServingLine(line) ?? tryParseSizeLine(line);
    if (serving?.digits) {
      digits += cleanDigits(serving.digits);
      i++;
      continue;
    }
    break;
  }

  return { digits, nextIdx: i };
}

function nutritionContext(category, servingLabel) {
  const cat = category.toLowerCase();
  const savoryCategory =
    /salad|bowl|wrap|sandwich|soup|protein|crunch|greens|grains|cheese|core chop|warm bowl/i.test(
      cat,
    ) && !/sweet|cookie|brownie|chiller|beverage|fountain/i.test(cat);
  return {
    dressing: /dressing|pantry/i.test(category) || /^\d+g$/i.test(servingLabel),
    beverage:
      /beverage|fountain/i.test(category) || /^\d+oz$/i.test(servingLabel),
    savory: savoryCategory || /^1 (salad|bowl|wrap|sandwich|portion|soup)/i.test(servingLabel),
    proteinPortion:
      /protein/i.test(cat) && /^1 portion$/i.test(String(servingLabel).trim()),
  };
}

function parseEntryBlock(lines, startIdx, category) {
  let i = startIdx;
  const line = lines[i];

  const combined = tryParseCombinedNameLine(line);
  if (combined) {
    const { digits, nextIdx } = accumulateDigits(lines, i + 1, combined.digits, category);
    const nutrients = parseNutritionDigits(digits, {
      ...nutritionContext(category, combined.servingLabel),
    });
    if (!nutrients) return null;
    return {
      name: cleanDisplayName(combined.name),
      category,
      servingLabel: combined.servingLabel,
      servingG: combined.servingG ?? defaultServingG(combined.servingLabel, category),
      nutrients,
      nextIdx,
    };
  }

  const sameLineServing = line.match(
    new RegExp(`^(.+?\\*?)\\s*1\\s+(${SERVING_TYPES})(.+)$`, "i"),
  );
  if (sameLineServing) {
    const { digits, nextIdx } = accumulateDigits(
      lines,
      i + 1,
      sameLineServing[3],
    );
    const nutrients = parseNutritionDigits(
      digits,
      nutritionContext(category, `1 ${sameLineServing[2].toLowerCase()}`),
    );
    if (!nutrients) return null;
    return {
      name: cleanDisplayName(sameLineServing[1]),
      category,
      servingLabel: `1 ${sameLineServing[2].toLowerCase()}`,
      servingG: defaultServingG(`1 ${sameLineServing[2]}`, category),
      nutrients,
      nextIdx,
    };
  }

  if (line === "1" && lines[i + 1]) {
    const nextServing = tryParseServingLine(lines[i + 1]);
    if (nextServing) {
      const name = lines[i - 1] && !SKIP_LINE.test(lines[i - 1]) ? lines[i - 1] : null;
      if (!name || CATEGORY_LINE.test(name)) return null;
      const { digits, nextIdx } = accumulateDigits(lines, i + 2, nextServing.digits, category);
      const nutrients = parseNutritionDigits(
        digits,
        nutritionContext(category, nextServing.servingLabel),
      );
      if (!nutrients) return null;
      return {
        name: cleanDisplayName(name),
        category,
        servingLabel: nextServing.servingLabel,
        servingG: defaultServingG(nextServing.servingLabel, category),
        nutrients,
        nextIdx,
      };
    }
  }

  const serving = tryParseServingLine(line) ?? tryParseSizeLine(line);
  if (serving) {
    const nameParts = [];
    let j = i - 1;
    while (j >= 0) {
      const prev = lines[j];
      if (!prev || SKIP_LINE.test(prev) || ALLERGEN_HEADER.test(prev)) break;
      if (CATEGORY_LINE.test(prev)) break;
      if (tryParseServingLine(prev) || tryParseSizeLine(prev) || tryParseCombinedNameLine(prev)) {
        break;
      }
      if (isDigitFragment(prev)) break;
      nameParts.unshift(prev);
      j--;
    }
    const rawName = nameParts.join(" ").replace(/\(\s+/g, "(").replace(/\s+\)/g, ")");
    if (rawName.length < 2) return null;

    const { digits, nextIdx } = accumulateDigits(lines, i + 1, serving.digits, category);
    const nutrients = parseNutritionDigits(
      digits,
      nutritionContext(category, serving.servingLabel),
    );
    if (!nutrients) return null;
    return {
      name: cleanDisplayName(rawName),
      category,
      servingLabel: serving.servingLabel,
      servingG: serving.servingG ?? defaultServingG(serving.servingLabel, category),
      nutrients,
      nextIdx,
    };
  }

  return null;
}

function defaultServingG(servingLabel, category) {
  const gMatch = servingLabel.match(/^(\d+)g$/i);
  if (gMatch) return Number(gMatch[1]);
  const ozMatch = servingLabel.match(/^(\d+)oz$/i);
  if (ozMatch) return Math.round(Number(ozMatch[1]) * 28.35);
  if (/dressing/i.test(category)) return 30;
  if (/soup/i.test(servingLabel)) return 350;
  if (/each/i.test(servingLabel)) return 85;
  if (/sandwich|wrap|roll/i.test(servingLabel)) return 280;
  if (/bowl/i.test(servingLabel)) return 450;
  return 350;
}

function disambiguateName(name, servingLabel, category, seen) {
  let display = name;
  let key = slugify(display);

  if (seen.has(key)) {
    display = `${name} (${servingLabel})`;
    key = slugify(display);
  }
  if (seen.has(key)) {
    const style = category.split(" — ").pop();
    if (style && style !== display) {
      display = `${name} (${servingLabel} — ${style})`;
      key = slugify(display);
    }
  }

  seen.add(key);
  return display;
}

export function scrapeChopt() {
  const lines = readSource("chopt-real2.txt")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const items = [];
  const seenNames = new Set();
  let category = "Menu";
  let dressingPortion = null;
  let dressingStyle = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (DRESSING_PORTION.test(line)) {
      dressingPortion = titleCaseName(line);
      continue;
    }
    if (DRESSING_SUBCATEGORY.test(line)) {
      dressingStyle = titleCaseName(line);
      continue;
    }
    if (CATEGORY_LINE.test(line)) {
      category = line;
      if (!/HOUSEMADE DRESSINGS/i.test(line)) {
        dressingPortion = null;
        dressingStyle = null;
      }
      continue;
    }
    if (SKIP_LINE.test(line) || ALLERGEN_HEADER.test(line)) continue;
    if (/^SANDWICH\s+INGREDIENTS$/i.test(line)) {
      category = "Sandwich Ingredients";
      continue;
    }
    if (/^VEGETARIAN$/i.test(line)) continue;

    const entry = parseEntryBlock(
      lines,
      i,
      normalizeCategory(category, dressingPortion, dressingStyle),
    );
    if (!entry) continue;

    const name = disambiguateName(entry.name, entry.servingLabel, entry.category, seenNames);
    items.push(
      makeItem({
        chainId: CHAIN_ID,
        name,
        category: entry.category,
        servingSize: entry.servingLabel,
        servingSizeG: entry.servingG,
        nutrients: entry.nutrients,
      }),
    );
    i = entry.nextIdx - 1;
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Chopt",
    source: SOURCE,
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeChopt();
