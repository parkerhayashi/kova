#!/usr/bin/env node
/**
 * Download Chick-fil-A nutrition/allergens page HTML.
 *
 * Usage: node scripts/scrapers/fetch-chickfila-source.mjs
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "../../data/restaurants/sources/chickfila.html");
const URL = "https://www.chick-fil-a.com/nutrition-allergens";

const res = await fetch(URL, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; Kova/1.0)" },
});
if (!res.ok) throw new Error(`Failed to fetch Chick-fil-A page (${res.status})`);

const html = await res.text();
writeFileSync(OUT, html);
console.log(`✓ Wrote chickfila.html (${html.length} chars) from ${URL}`);
