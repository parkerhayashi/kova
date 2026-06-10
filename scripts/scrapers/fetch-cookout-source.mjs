#!/usr/bin/env node
/**
 * Download Cook Out nutrition PDF and refresh cookout-nutrition.txt.
 *
 * Usage: node scripts/scrapers/fetch-cookout-source.mjs
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-parse/lib/pdf-parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const SOURCES = join(ROOT, "data/restaurants/sources");
const PDF_URL =
  "https://cookout.com/wp-content/uploads/Cook-Out-Nutrition1.pdf";

const res = await fetch(PDF_URL, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; Kova/1.0)" },
});
if (!res.ok) throw new Error(`Failed to fetch Cook Out PDF (${res.status})`);

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(join(SOURCES, "cookout-nutrition.pdf"), buf);

const { text } = await pdf(buf);
writeFileSync(join(SOURCES, "cookout-nutrition.txt"), text);
console.log(`✓ Wrote cookout-nutrition.txt (${text.length} chars) from ${PDF_URL}`);
