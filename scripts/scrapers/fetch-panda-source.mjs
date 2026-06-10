/**
 * Refresh Panda Express US nutrition source.
 * The official site blocks most automated curl requests; this tries fetch
 * and falls back to the cached markdown export.
 *
 * Usage: node scripts/scrapers/fetch-panda-source.mjs
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { ROOT, SOURCES_DIR } from "./_shared.mjs";

const URL = "https://www.pandaexpress.com/nutritioninformation";
const OUT = join(SOURCES_DIR, "panda-us-nutrition.md");

async function fetchSource() {
  const res = await fetch(URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const html = await res.text();
  if (html.includes("captcha-delivery") || html.length < 5000) {
    throw new Error("Blocked by bot protection");
  }

  writeFileSync(OUT, html);
  console.log(`✓ Saved HTML → ${OUT.replace(ROOT + "/", "")}`);
}

try {
  await fetchSource();
} catch (err) {
  console.warn(`Could not refresh Panda source (${err.message}).`);
  console.warn(`Using cached ${OUT.replace(ROOT + "/", "")}`);
}
