import {
  makeItem,
  nutrientsFromStandardRow,
  parseConcatenatedNutrition,
  readSource,
  writeChain,
} from "./_shared.mjs";

const CHAIN_ID = "chipotle";

function parsePortionLine(line) {
  const m = line.match(/^([\d.]+\s*(?:ea|oz|fl oz))(.+)$/i);
  if (!m) return null;
  const nums = parseConcatenatedNutrition(m[2]);
  const nutrients = nutrientsFromStandardRow(nums);
  if (!nutrients) return null;
  return { servingSize: m[1].trim(), nutrients };
}

export function scrapeChipotle() {
  const text = readSource("chipotle.txt");
  const start = text.indexOf("PortionCaloriesCalories From Fat");
  if (start === -1) throw new Error("Chipotle nutrition table not found");
  const section = text.slice(start).split("\n");
  const items = [];
  let category = "Ingredients";

  for (let i = 1; i < section.length - 1; i++) {
    const name = section[i].trim();
    const dataLine = section[i + 1]?.trim() ?? "";
    if (!name || name.length < 2) continue;
    if (/^Portion|^nutrition|^Offerings|^©|^2,000/.test(name)) continue;
    if (/^[A-Z][A-Z\s&]+$/.test(name) && name.length < 40) {
      category = name.replace(/\s+/g, " ");
      continue;
    }

    const parsed = parsePortionLine(dataLine);
    if (!parsed) continue;
    const servingG = parsed.servingSize.includes("oz")
      ? Number(parsed.servingSize) * 28.35
      : 100;

    items.push(
      makeItem({
        chainId: CHAIN_ID,
        name,
        category,
        servingSize: parsed.servingSize,
        servingSizeG: servingG,
        nutrients: parsed.nutrients,
      }),
    );
    i++;
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Chipotle",
    source: "chipotle.com/nutrition",
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeChipotle();
