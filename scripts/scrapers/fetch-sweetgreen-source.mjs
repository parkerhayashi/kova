#!/usr/bin/env node
/**
 * Download Sweetgreen nutrition page HTML for reference.
 * Primary scraper input is data/restaurants/sources/sweetgreen-nutrition.md
 * (export tables from sweetgreenmenus.com/sweetgreen-nutrition/).
 *
 * Usage: node scripts/scrapers/fetch-sweetgreen-source.mjs
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const SOURCES = join(ROOT, "data/restaurants/sources");
const URL = "https://sweetgreenmenus.com/sweetgreen-nutrition/";

const res = await fetch(URL, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; Kova/1.0)" },
});
if (!res.ok) throw new Error(`Failed to fetch Sweetgreen page (${res.status})`);

const html = await res.text();
writeFileSync(join(SOURCES, "sweetgreen-nutrition.html"), html);
console.log(`✓ Wrote sweetgreen-nutrition.html (${html.length} chars) from ${URL}`);
