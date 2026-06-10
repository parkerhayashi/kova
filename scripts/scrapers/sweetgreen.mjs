import {
  makeItem,
  nutrientsFromStandardRow,
  parseConcatenatedNutrition,
  readSource,
  writeChain,
} from "./_shared.mjs";

const CHAIN_ID = "sweetgreen";

function parseRow(line) {
  const m = line.match(/^([A-Z][A-Z0-9\s&'+\-/().,*]+?)(\d{2,}.*)$/);
  if (!m) return null;
  const nums = parseConcatenatedNutrition(m[2], 12, { profile: "servingFirst" });
  if (nums.length < 12) return null;
  const servingSizeG = nums[0];
  const nutrients = nutrientsFromStandardRow(nums.slice(1));
  if (!nutrients) return null;
  return { name: m[1].trim(), servingSizeG, nutrients };
}

export function scrapeSweetgreen() {
  const text = readSource("sweetgreen.txt");
  const items = [];
  let category = "Menu";

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes("Serving Size")) {
      category = line.split("Serving Size")[0].trim() || category;
      continue;
    }
    const parsed = parseRow(line);
    if (!parsed) continue;
    items.push(
      makeItem({
        chainId: CHAIN_ID,
        name: parsed.name,
        category,
        servingSize: `${parsed.servingSizeG} g`,
        servingSizeG: parsed.servingSizeG,
        nutrients: parsed.nutrients,
      }),
    );
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Sweetgreen",
    source: "sweetgreen.com/nutrition",
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeSweetgreen();
