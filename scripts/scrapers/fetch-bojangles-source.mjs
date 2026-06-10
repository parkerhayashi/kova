#!/usr/bin/env node
/**
 * Download Bojangles nutrition PDF and refresh text source.
 *
 * Usage: node scripts/scrapers/fetch-bojangles-source.mjs
 */

import { writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import pdf from "pdf-parse/lib/pdf-parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCES = join(__dirname, "../../data/restaurants/sources");
const PDF_URL =
  "https://www.bojanglesrdu.com/wp-content/uploads/2017/04/bojangles-nutrition.pdf";

const res = await fetch(PDF_URL, {
  headers: { "User-Agent": "Mozilla/5.0 (compatible; Kova/1.0)" },
});
if (!res.ok) throw new Error(`Failed to fetch Bojangles PDF (${res.status})`);

const buf = Buffer.from(await res.arrayBuffer());
writeFileSync(join(SOURCES, "bojangles-nutrition.pdf"), buf);

const { text } = await pdf(buf);
writeFileSync(join(SOURCES, "bojangles-nutrition.txt"), text);
console.log(`✓ Wrote bojangles-nutrition.txt (${text.length} chars)`);
