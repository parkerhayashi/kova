import { readFileSync } from "fs";
import { join } from "path";
import { makeItem, ROOT, writeChain } from "./_shared.mjs";

const CHAIN_ID = "panda-express";
const SOURCE_PATH = join(ROOT, "data/restaurants/sources/panda-us-nutrition.md");

function titleCase(name) {
  return name.replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function parseNutritionRow(line) {
  const pick = (pattern) => {
    const match = line.match(pattern);
    if (!match) return null;
    if (match[1].includes("<")) return 0;
    return Number(match[1]);
  };

  const servingOz = line.match(/Serving Size \(OZ\)\s*([\d.]+)/i)?.[1];
  const nutrients = {
    calories: pick(/Calories\s*([\d.<>]+)/i),
    fat_g: pick(/Total fat \(G\)\s*([\d.<>]+)/i),
    saturated_fat_g: pick(/Saturated fat \(G\)\s*([\d.<>]+)/i),
    trans_fat_g: pick(/Trans fat \(G\)\s*([\d.<>]+)/i),
    cholesterol_mg: pick(/Cholesterol \(MG\)\s*([\d.<>]+)/i),
    sodium_mg: pick(/Sodium \(MG\)\s*([\d.<>]+)/i),
    carbs_g: pick(/Total carb \(G\)\s*([\d.<>]+)/i),
    fiber_g: pick(/Dietary fiber \(G\)\s*([\d.<>]+)/i),
    sugar_g: pick(/Sugars \(G\)\s*([\d.<>]+)/i),
    protein_g: pick(/Protein \(G\)\s*([\d.<>]+)/i),
  };

  if (nutrients.calories == null) return null;

  return {
    servingSize: servingOz ? `${servingOz} oz` : "1 serving",
    servingSizeG: servingOz ? Number(servingOz) * 28.35 : 150,
    nutrients,
  };
}

function parseMarkdownExport(text) {
  const names = [];
  const rows = [];
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
      const row = parseNutritionRow(line);
      if (row) rows.push(row);
      continue;
    }

    if (line.startsWith("| ---") || (phase === "rows" && line.startsWith("|"))) {
      continue;
    }

    if (phase === "names") {
      names.push({ name: line, category });
    }
  }

  return { names, rows };
}

function parseHtmlExport(html) {
  const names = [];
  const rows = [];
  let category = "Menu";
  let inNutritionTable = false;

  const itemNamePattern =
    /^[a-z0-9][a-z0-9\s&'().,-]+$/i;

  for (const raw of html.split("\n")) {
    const line = raw.replace(/<[^>]+>/g, "").trim();
    if (!line) continue;

    if (/^##\s+/.test(line)) {
      category = line.replace(/^##\s+/, "").trim();
      continue;
    }

    if (line.includes("Serving Size (OZ)") && line.includes("Calories")) {
      inNutritionTable = true;
      const row = parseNutritionRow(line.replace(/^\|\s*/, "").replace(/\s*\|$/, ""));
      if (row) rows.push(row);
      continue;
    }

    if (inNutritionTable) continue;

    if (
      itemNamePattern.test(line) &&
      line.length > 2 &&
      line.length < 80 &&
      !/^(Clear Search|Full Nutrition|Sign Up|Log In)/i.test(line)
    ) {
      names.push({ name: line, category });
    }
  }

  return { names, rows };
}

export function scrapePandaExpress() {
  const text = readFileSync(SOURCE_PATH, "utf8");
  const parsed = text.includes("<html")
    ? parseHtmlExport(text)
    : parseMarkdownExport(text);

  const items = [];
  const count = Math.min(parsed.names.length, parsed.rows.length);

  for (let i = 0; i < count; i++) {
    const { name, category } = parsed.names[i];
    const row = parsed.rows[i];
    const displayName = /[A-Z]/.test(name.slice(1)) ? name : titleCase(name);

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

  if (parsed.names.length !== parsed.rows.length) {
    const unmatched = parsed.names.slice(count).map((n) => n.name);
    console.warn(
      `  ⚠ Panda: ${unmatched.length} item(s) without nutrition rows:`,
      unmatched.join(", "),
    );
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Panda Express",
    source: "pandaexpress.com/nutritioninformation",
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) scrapePandaExpress();
