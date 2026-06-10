#!/usr/bin/env node
/**
 * Download Jersey Mike's CA nutrition PDF and refresh jerseymikes-ca-nutrition.txt.
 *
 * Usage: node scripts/scrapers/fetch-jerseymikes-source.mjs
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-parse/lib/pdf-parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const SOURCES = join(ROOT, "data/restaurants/sources");
const PDF_URL = "https://www.jerseymikes.ca/nutrition?type=nutrition";

const res = await fetch(PDF_URL, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; Kova/1.0)" },
});
if (!res.ok) throw new Error(`Failed to fetch Jersey Mike's PDF (${res.status})`);

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(join(SOURCES, "jerseymikes-ca-nutrition.pdf"), buf);

const { text } = await pdf(buf);
writeFileSync(join(SOURCES, "jerseymikes-ca-nutrition.txt"), text);
console.log(
  `✓ Wrote jerseymikes-ca-nutrition.txt (${text.length} chars) from ${PDF_URL}`,
);
