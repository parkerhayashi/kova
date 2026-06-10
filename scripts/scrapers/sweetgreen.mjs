import { makeItem, readSource, writeChain } from "./_shared.mjs";

const CHAIN_ID = "sweetgreen";
const SOURCE = "sweetgreenmenus.com/sweetgreen-nutrition/";

const SKIP_SECTIONS = new Set([
  "Sweetgreen Nutrition Information – Core Menu",
  "Sweetgreen Nutrition – Core Menu (Online Exclusives)",
  "Sweetgreen Nutrition Information – Summer Menu",
]);

const SKIP_NAME_RE =
  /^(Packaged Desserts|Sweetflow \(Select|Housemade Craft Beverages|Packaged Beverages)$/i;

function parseNum(value) {
  if (value == null || value === "") return null;
  const n = Number(String(value).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}

function cleanName(raw) {
  return raw.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
}

function parseTableRow(line) {
  if (!line.startsWith("|") || line.includes("---")) return null;

  const cells = line
    .split("|")
    .map((cell) => cell.trim())
    .slice(1, -1);

  if (cells.length < 12) return null;

  const name = cleanName(cells[0]);
  if (!name || SKIP_NAME_RE.test(name)) return null;
  if (/menu item/i.test(name) || /serving size/i.test(cells[1])) return null;

  const serving = parseNum(cells[1]);
  const calories = parseNum(cells[2]);
  if (serving == null || calories == null) return null;

  const nutrients = {
    calories,
    fat_g: parseNum(cells[3]),
    saturated_fat_g: parseNum(cells[4]),
    trans_fat_g: parseNum(cells[5]),
    cholesterol_mg: parseNum(cells[6]),
    sodium_mg: parseNum(cells[7]),
    carbs_g: parseNum(cells[8]),
    fiber_g: parseNum(cells[9]),
    sugar_g: parseNum(cells[10]),
    protein_g: parseNum(cells[11]),
  };

  const servingIsOz = cells[1] && !cells[1].includes("g") && Number(cells[1]) <= 64;

  return {
    name,
    servingSize: servingIsOz ? `${serving} oz` : `${serving} g`,
    servingSizeG: servingIsOz ? Math.round(serving * 28.35) : serving,
    nutrients,
  };
}

function categoryLabel(section, subsection) {
  if (section === "Ingredients" && subsection) return `${section} — ${subsection}`;
  return subsection || section || "Menu";
}

export function scrapeSweetgreen(sourceFile = "sweetgreen-nutrition.md") {
  const text = readSource(sourceFile);
  const itemsById = new Map();

  let section = "Menu";
  let subsection = null;
  let inIngredients = false;
  let skipSection = false;

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("## ")) {
      const heading = line.slice(3).replace(/\s*\\?\[.*$/, "").trim();
      skipSection = SKIP_SECTIONS.has(heading);

      if (heading === "Sweetgreen Nutrition Information – Core Menu") {
        skipSection = true;
      } else if (
        heading.startsWith("Sweetgreen Nutrition Information") &&
        !heading.includes("Core Menu") &&
        !heading.includes("Summer Menu")
      ) {
        section = "Menu";
        subsection = null;
        inIngredients = false;
        skipSection = false;
      }
      continue;
    }

    if (skipSection) continue;

    if (line.startsWith("### ")) {
      const heading = line.slice(4).trim();
      if (heading === "Ingredients") {
        section = "Ingredients";
        subsection = null;
        inIngredients = true;
      } else if (inIngredients) {
        subsection = heading;
      } else {
        section = "Menu";
        subsection = heading;
      }
      continue;
    }

    if (line.startsWith("#### ")) {
      subsection = line.slice(5).trim();
      continue;
    }

    const parsed = parseTableRow(line);
    if (!parsed) continue;

    const category = categoryLabel(section, subsection);
    let item = makeItem({
      chainId: CHAIN_ID,
      name: parsed.name,
      category,
      servingSize: parsed.servingSize,
      servingSizeG: parsed.servingSizeG,
      nutrients: parsed.nutrients,
    });

    if (itemsById.has(item.id)) {
      const prior = itemsById.get(item.id);
      if (prior.category.startsWith("Ingredients") !== category.startsWith("Ingredients")) {
        const disambig = `${parsed.name} (${category})`;
        item = makeItem({
          chainId: CHAIN_ID,
          name: disambig,
          category,
          servingSize: parsed.servingSize,
          servingSizeG: parsed.servingSizeG,
          nutrients: parsed.nutrients,
        });
      } else if (JSON.stringify(prior.nutrients) === JSON.stringify(item.nutrients)) {
        continue;
      }
    }

    itemsById.set(item.id, item);
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Sweetgreen",
    source: SOURCE,
    syncedAt: new Date().toISOString(),
    items: [...itemsById.values()],
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapeSweetgreen();
