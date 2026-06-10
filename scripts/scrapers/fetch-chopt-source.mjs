#!/usr/bin/env node
/**
 * Download Chopt nutrition/allergen PDF and refresh chopt-real2.txt.
 *
 * Usage: node scripts/scrapers/fetch-chopt-source.mjs
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-parse/lib/pdf-parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const SOURCES = join(ROOT, "data/restaurants/sources");
const PDF_URL =
  "https://assets.choptsalad.com/pdfs/web/chopt_nutrition_allergen_guide.pdf";

const res = await fetch(PDF_URL, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; Kova/1.0)" },
});
if (!res.ok) throw new Error(`Failed to fetch Chopt PDF (${res.status})`);

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(join(SOURCES, "chopt-nutrition-allergen-guide.pdf"), buf);

const { text } = await pdf(buf);
writeFileSync(join(SOURCES, "chopt-real2.txt"), text);
console.log(
  `✓ Wrote chopt-real2.txt (${text.length} chars) from ${PDF_URL}`,
);
