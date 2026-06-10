import { makeItem, readSource, writeChain } from "./_shared.mjs";

const CHAIN_ID = "panda-express";
const SOURCE = "pandaexpress.com/nutritioninformation";

const PATCHES = {
  "lemon green tea - kids": {
    servingSize: "12.00 oz",
    servingSizeG: 340,
    nutrients: {
      calories: 0,
      fat_g: 0,
      saturated_fat_g: 0,
      trans_fat_g: 0,
      cholesterol_mg: 0,
      sodium_mg: 40,
      carbs_g: 1,
      fiber_g: 0,
      sugar_g: 0,
      protein_g: 0,
    },
  },
};

function titleCase(name) {
  return name.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function isHeaderRow(line) {
  return /^\|\s*Serving Size \(OZ\)\s*\|\s*Calories\s*\|/i.test(line);
}

function parseNutritionRow(line) {
  const pick = (pattern) => {
    const match = line.match(pattern);
    if (!match) return null;
    if (match[1].includes("<")) return 0;
    return Number(match[1]);
  };

  const servingOz = line.match(/Serving Size \(OZ\)\s*([\d.]+)/i)?.[1];
  if (!servingOz) return null;

  const calories = pick(/Calories\s*([\d.<>]+)/i);
  if (calories == null) return null;

  return {
    servingSize: `${servingOz} oz`,
    servingSizeG: Number(servingOz) * 28.35,
    nutrients: {
      calories,
      fat_g: pick(/Total fat \(G\)\s*([\d.<>]+)/i),
      saturated_fat_g: pick(/Saturated fat \(G\)\s*([\d.<>]+)/i),
      trans_fat_g: pick(/Trans fat \(G\)\s*([\d.<>]+)/i),
      cholesterol_mg: pick(/Cholesterol \(MG\)\s*([\d.<>]+)/i),
      sodium_mg: pick(/Sodium \(MG\)\s*([\d.<>]+)/i),
      carbs_g: pick(/Total carb \(G\)\s*([\d.<>]+)/i),
      fiber_g: pick(/Dietary fiber \(G\)\s*([\d.<>]+)/i),
      sugar_g: pick(/Sugars \(G\)\s*([\d.<>]+)/i),
      protein_g: pick(/Protein \(G\)\s*([\d.<>]+)/i),
    },
  };
}

function parseExport(text) {
  const names = [];
  const servingLines = [];
  let phase = "pre";
  let category = "Menu";

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    if (line === "## Sides") {
      phase = "names";
      category = "Sides";
      continue;
    }

    if (line.startsWith("## ")) {
      category = line.slice(3).trim();
      continue;
    }

    if (line.startsWith("| Serving Size (OZ)")) {
      phase = "rows";
      servingLines.push(line);
      continue;
    }

    if (line.startsWith("| ---") || (phase === "rows" && line.startsWith("|"))) {
      continue;
    }

    if (phase === "names") {
      names.push({ name: line, category });
    }
  }

  return { names, servingLines };
}

export function scrapePandaExpress(sourceFile = "panda-us-nutrition.md") {
  const text = readSource(sourceFile);
  const { names, servingLines } = parseExport(text);
  const items = [];
  const skipped = [];

  if (names.length !== servingLines.length) {
    console.warn(
      `  ⚠ Panda: ${names.length} names vs ${servingLines.length} nutrition rows`,
    );
  }

  const count = Math.min(names.length, servingLines.length);

  for (let i = 0; i < count; i++) {
    const { name, category } = names[i];
    const line = servingLines[i];
    const patch = PATCHES[name];
    const displayName = /[A-Z]/.test(name.slice(1)) ? name : titleCase(name);

    if (isHeaderRow(line)) {
      if (patch) {
        items.push(
          makeItem({
            chainId: CHAIN_ID,
            name: displayName,
            category,
            servingSize: patch.servingSize,
            servingSizeG: patch.servingSizeG,
            nutrients: patch.nutrients,
          }),
        );
      } else {
        skipped.push(displayName);
      }
      continue;
    }

    const row = parseNutritionRow(line);
    if (!row) {
      skipped.push(displayName);
      continue;
    }

    items.push(
      makeItem({
        chainId: CHAIN_ID,
        name: displayName,
        category,
        servingSize: row.servingSize,
        servingSizeG: row.servingSizeG,
        nutrients: row.nutrients,
      }),
    );
  }

  if (skipped.length) {
    console.warn(`  ⚠ Panda: skipped ${skipped.length} item(s):`, skipped.join(", "));
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Panda Express",
    source: SOURCE,
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapePandaExpress();
