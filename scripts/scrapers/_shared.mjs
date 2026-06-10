import { mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, "../..");
export const CHAINS_DIR = join(ROOT, "data/restaurants/chains");
export const SOURCES_DIR = join(ROOT, "data/restaurants/sources");

export function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseNumbers(text) {
  return [...text.matchAll(/(\d+\.?\d*|<\s*1)/g)].map((m) =>
    m[1].includes("<") ? 0 : Number(m[1]),
  );
}

/** Split space-free nutrition PDF strings into fields. */
export function parseConcatenatedNutrition(text, fieldCount = 11, options = {}) {
  const { strictEnd = true, profile = "standard" } = options;
  const rest = text.replace(/<\s*1/g, "0").replace(/\s/g, "").replace(/[XYx]+$/g, "");
  const solutions = [];

  function validField(index, value, acc) {
    if (value < 0) return false;

    if (profile === "servingFirst") {
      if (index === 0 && (value < 10 || value > 2500)) return false;
      if (index === 1 && value > 2500) return false;
      if (index === 2 && acc[1] !== undefined && value > acc[1]) return false;
      if (index === 3 && value > 60) return false;
      if (index === 4 && acc[3] !== undefined && value > acc[3] + 0.01) return false;
      if (index === 5 && value > 2) return false;
      if (index === 6 && value > 500) return false;
      if (index === 7 && value > 8000) return false;
      if (index === 8 && value > 600) return false;
      if (index === 9 && value > 100) return false;
      if (index === 10 && value > 300) return false;
      if (index === 11 && value > 300) return false;
      return true;
    }

    if (profile === "cavaMacros") {
      if (index === 0 && value > 2500) return false;
      if (index === 1 && value > 60) return false;
      if (index === 2 && acc[1] !== undefined && value > acc[1] + 0.01) return false;
      if (index === 3 && value > 2) return false;
      if (index === 4 && value > 500) return false;
      if (index === 5 && value > 3000) return false;
      if (index === 6 && value > 600) return false;
      if (index === 7 && value > 100) return false;
      if (index === 8 && value > 300) return false;
      if (index === 9 && value > 300) return false;
      return true;
    }

    if (index === 0 && value > 2500) return false;
    if (index === 1 && acc[0] !== undefined && value > acc[0]) return false;
    if (index === 2 && value > 60) return false;
    if (index === 3 && acc[2] !== undefined && value > acc[2] + 0.01) return false;
    if (index === 4 && value > 2) return false;
    if (index === 5 && value > 500) return false;
    if (index === 6 && value > 8000) return false;
    if (index === 7 && value > 600) return false;
    if (index === 8 && value > 100) return false;
    if (index === 9 && value > 300) return false;
    if (index === 10 && value > 300) return false;
    if (index === 11 && value > 2000) return false;
    return true;
  }

  function scoreSolution(nums) {
    let score = 0;
    const cal = profile === "servingFirst" ? nums[1] : nums[0];
    const fat = profile === "servingFirst" ? nums[3] : profile === "cavaMacros" ? nums[1] : nums[2];
    const carbs = profile === "servingFirst" ? nums[8] : profile === "cavaMacros" ? nums[6] : nums[7];
    const sodium = profile === "servingFirst" ? nums[7] : profile === "cavaMacros" ? nums[5] : nums[6];
    const protein = nums[nums.length - 1];

    if (cal >= 5 && cal <= 2500) score += 10;
    if (fat >= 0 && fat <= 60) score += 5;
    if (sodium >= 0 && sodium <= 8000) score += 5;
    if (protein >= 0 && protein <= 100) score += 5;
    if (carbs >= 0 && carbs <= 600) score += 3;
    if (cal > 150 && carbs >= 15) score += 8;
    if (cal > 150 && carbs === 0 && protein > 10) score -= 4;
    if (profile === "standard" && nums[4] === 0) score += 2;
    return score;
  }

  function dfs(remaining, index, acc) {
    if (index === fieldCount) {
      if (strictEnd && remaining.length !== 0) return;
      solutions.push([...acc]);
      return;
    }
    if (!remaining.length) return;

    const fieldsLeft = fieldCount - index;
    if (remaining.length < fieldsLeft) return;
    if (strictEnd && remaining.length > fieldsLeft * 4) return;

    const candidates = [];
    for (let len = Math.min(4, remaining.length); len >= 1; len--) {
      const chunk = remaining.slice(0, len);
      if (!/^\d+$/.test(chunk)) continue;
      candidates.push({ val: Number(chunk), len });
    }

    const dec = remaining.match(/^(\d+\.\d{1,2})/);
    const fatIndex = profile === "servingFirst" ? 3 : 2;
    if (dec && index !== fatIndex) {
      candidates.push({ val: Number(dec[1]), len: dec[1].length });
    }

    for (const { val, len } of candidates) {
      if (!validField(index, val, acc)) continue;
      dfs(remaining.slice(len), index + 1, [...acc, val]);
    }
  }

  dfs(rest, 0, []);
  if (!solutions.length) return [];
  solutions.sort((a, b) => scoreSolution(b) - scoreSolution(a));
  return solutions[0];
}

export function nutrientsFromStandardRow(nums) {
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

export function makeItem({
  chainId,
  name,
  category = null,
  servingSize = "1 serving",
  servingSizeG = 100,
  nutrients,
  tags = [],
}) {
  const cleanName = name.replace(/\s+/g, " ").trim();
  return {
    id: `${chainId}:${slugify(cleanName)}`,
    name: cleanName,
    category,
    menu: null,
    servingSize,
    serving_size_g: Math.round(servingSizeG),
    tags,
    nutrients: {
      calories: nutrients.calories ?? null,
      protein_g: nutrients.protein_g ?? null,
      carbs_g: nutrients.carbs_g ?? null,
      fat_g: nutrients.fat_g ?? null,
      saturated_fat_g: nutrients.saturated_fat_g ?? null,
      trans_fat_g: nutrients.trans_fat_g ?? null,
      cholesterol_mg: nutrients.cholesterol_mg ?? null,
      sodium_mg: nutrients.sodium_mg ?? null,
      fiber_g: nutrients.fiber_g ?? null,
      sugar_g: nutrients.sugar_g ?? null,
    },
  };
}

export function writeChain(chain) {
  mkdirSync(CHAINS_DIR, { recursive: true });
  const path = join(CHAINS_DIR, `${chain.id}.json`);
  writeFileSync(path, `${JSON.stringify(chain, null, 2)}\n`);
  console.log(`  ✓ ${chain.name}: ${chain.items.length} items → ${path.replace(ROOT + "/", "")}`);
  return chain;
}

export function readSource(filename) {
  return readFileSync(join(SOURCES_DIR, filename), "utf8");
}
