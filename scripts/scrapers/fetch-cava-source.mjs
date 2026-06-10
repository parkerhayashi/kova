#!/usr/bin/env node
/**
 * Download Cava nutrition/allergen PDF and refresh text source.
 *
 * Usage: node scripts/scrapers/fetch-cava-source.mjs
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-parse/lib/pdf-parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "../..");
const SOURCES = join(ROOT, "data/restaurants/sources");
const PDF_URL =
  "https://assets.ctfassets.net/kugm9fp9ib18/7KrOGNUFZjBddOWezWLWwm/a20b10d71b9b0496f96b8e38bd8e0211/CAVA-REC-GID-0326-AllergReg.pdf";

const res = await fetch(PDF_URL, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; Kova/1.0)" },
});
if (!res.ok) throw new Error(`Failed to fetch Cava PDF (${res.status})`);

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(join(SOURCES, "cava-allergens-reg-0326.pdf"), buf);

const { text } = await pdf(buf);
writeFileSync(join(SOURCES, "cava-allergens-reg-0326.txt"), text);
console.log(`✓ Wrote cava-allergens-reg-0326.txt (${text.length} chars) from CAVA-REC-GID-0326`);
