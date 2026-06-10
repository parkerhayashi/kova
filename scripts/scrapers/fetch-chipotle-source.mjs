#!/usr/bin/env node
/**
 * Download Chipotle US nutrition PDF and refresh chipotle.txt source.
 *
 * Usage: node scripts/scrapers/fetch-chipotle-source.mjs
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-parse/lib/pdf-parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const SOURCES = join(ROOT, "data/restaurants/sources");
const PDF_URL =
  "https://www.chipotle.com/content/dam/chipotle/menu/nutrition/US-Nutrition-Facts-Paper-Menu-3-2025.pdf";

const res = await fetch(PDF_URL, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; Kova/1.0)" },
});
if (!res.ok) throw new Error(`Failed to fetch Chipotle PDF (${res.status})`);

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(join(SOURCES, "chipotle-nutrition-2025-03.pdf"), buf);

const { text } = await pdf(buf);
writeFileSync(join(SOURCES, "chipotle.txt"), text);
console.log(`✓ Wrote chipotle.txt (${text.length} chars) from ${PDF_URL}`);
