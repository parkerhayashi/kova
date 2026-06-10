import { makeItem, writeChain } from "./_shared.mjs";

const CHAIN_ID = "shahs-halal";

const MENU_SLUGS = [
  "chicken-over-rice",
  "shahwarma-over-rice",
  "beef-and-lamb-over-rice",
  "lamb-over-rice",
  "all-lamb-over-rice",
  "combo-over-rice",
  "falafel-over-rice",
  "fish-over-rice",
  "kofta-kabab-over-rice",
  "chicken-gyro",
  "lamb-gyro",
  "mixed-gyro",
  "falafel-gyro",
  "chicken-cheese-steak",
  "philly-cheese-steak",
  "chapli-kabab",
  "chicken-chapli-kabab",
  "chicken-tikka-kabab",
  "chicken-biryani",
  "lamb-biryani",
  "mixed-biryani",
  "build-your-own-salad",
];

function firstMatch(html, patterns) {
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m) return m[1];
  }
  return null;
}

function parseMenuPage(html, slug) {
  const title =
    html.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1]?.trim() ??
    slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const calBlock = html.match(/Per Serving[\s\S]*?<h3>Per Serving<\/h3>([\s\S]*?)<\/div>/i)?.[1] ?? html;
  const values = [...calBlock.matchAll(/aria-hidden="true">([\d.]+)\s*(?:Cal|g|mg)?/gi)].map(
    (m) => Number(m[1]),
  );

  const headerCal = html.match(/class="cal">([\d.]+)\s*Cal/i)?.[1];
  const servingG = html.match(/class="cal">[\d.]+\s*Cal\s*<span>\s*\/\s*([\d.]+)\s*g/i)?.[1];

  const calories = headerCal ? Math.round(Number(headerCal)) : values[0] ?? null;
  const fat_g = values[1] ?? null;
  const carbs_g = values[2] ?? null;
  const protein_g = values[3] ?? null;

  if (!calories) return null;

  return {
    name: title.replace(/&#8211;/g, "–"),
    servingSize: servingG ? `${servingG} g` : "1 serving",
    servingSizeG: servingG ? Number(servingG) : 212,
    nutrients: { calories, protein_g, carbs_g, fat_g },
  };
}

export async function scrapeShahsHalal() {
  const items = [];

  for (const slug of MENU_SLUGS) {
    const url = `https://www.shahshalalfood.com/our-food-menu/${slug}/`;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Kova/1.0)" },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const parsed = parseMenuPage(html, slug);
      if (!parsed) continue;
      items.push(
        makeItem({
          chainId: CHAIN_ID,
          name: parsed.name,
          category: "Plates & Gyros",
          servingSize: parsed.servingSize,
          servingSizeG: parsed.servingSizeG,
          nutrients: parsed.nutrients,
        }),
      );
    } catch {
      // skip unavailable pages
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  return writeChain({
    id: CHAIN_ID,
    name: "Shah's Halal Food",
    source: "shahshalalfood.com/nutrition-and-allergen",
    syncedAt: new Date().toISOString(),
    items,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  scrapeShahsHalal().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
