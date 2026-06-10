#!/usr/bin/env node
/**
 * Download Five Guys US nutrition/allergen PDF and refresh fiveguys-nutrition.txt.
 *
 * Usage: node scripts/scrapers/fetch-fiveguys-source.mjs
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-parse/lib/pdf-parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const SOURCES = join(ROOT, "data/restaurants/sources");
const PDF_URL =
  "https://www.fiveguys.com/wp-content/uploads/2025/07/five-guys-us-nutrition-allergen-guide-english-1-final.pdf";

const res = await fetch(PDF_URL, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; Kova/1.0)" },
});
if (!res.ok) throw new Error(`Failed to fetch Five Guys PDF (${res.status})`);

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(join(SOURCES, "fiveguys-nutrition-2025-07.pdf"), buf);

const { text } = await pdf(buf);
writeFileSync(join(SOURCES, "fiveguys-nutrition.txt"), text);
console.log(`✓ Wrote fiveguys-nutrition.txt (${text.length} chars) from ${PDF_URL}`);
