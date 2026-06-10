/**
 * Scrape all restaurant chain nutrition catalogs.
 *
 * Usage:  npm run restaurants:scrape
 *         node scripts/scrapers/run-all.mjs [chain-id...]
 *
 * Writes data/restaurants/chains/*.json — then run npm run restaurants:sync
 */

import { scrapeBojangles } from "./bojangles.mjs";
import { scrapeCava } from "./cava.mjs";
import { scrapeChickFilA } from "./chickfila.mjs";
import { scrapeChipotle } from "./chipotle.mjs";
import { scrapeChopt } from "./chopt.mjs";
import { scrapeCookOut } from "./cookout.mjs";
import { scrapeFiveGuys } from "./fiveguys.mjs";
import { scrapeJerseyMikes } from "./jerseymikes.mjs";
import { scrapePandaExpress } from "./panda.mjs";
import { scrapeShahsHalal } from "./shahs-halal.mjs";
import { scrapeSweetgreen } from "./sweetgreen.mjs";

const SCRAPERS = {
  chipotle: scrapeChipotle,
  sweetgreen: scrapeSweetgreen,
  "chick-fil-a": scrapeChickFilA,
  cava: scrapeCava,
  "five-guys": scrapeFiveGuys,
  chopt: scrapeChopt,
  bojangles: scrapeBojangles,
  "panda-express": scrapePandaExpress,
  "jersey-mikes": scrapeJerseyMikes,
  "shahs-halal": scrapeShahsHalal,
  "cook-out": scrapeCookOut,
};

const selected = process.argv.slice(2);
const toRun =
  selected.length > 0
    ? selected.filter((id) => {
        if (!SCRAPERS[id]) console.warn(`Unknown chain: ${id}`);
        return SCRAPERS[id];
      })
    : Object.keys(SCRAPERS);

console.log(`Scraping ${toRun.length} restaurant chain(s)…\n`);

const results = [];
for (const id of toRun) {
  try {
    const chain = await SCRAPERS[id]();
    results.push(chain);
  } catch (err) {
    console.error(`✗ ${id}: ${err.message}`);
  }
}

const total = results.reduce((n, c) => n + c.items.length, 0);
console.log(`\nDone — ${total} items across ${results.length} chain(s).`);
console.log("Run npm run restaurants:sync to merge into catalog.json.");

if (results.length === 0) process.exit(1);
