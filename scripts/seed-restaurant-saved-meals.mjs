#!/usr/bin/env node
/**
 * Seed regular restaurant meals into saved_meals.
 *
 * Usage: node --env-file=.env.local scripts/seed-restaurant-saved-meals.mjs
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, serviceKey);
const catalog = JSON.parse(
  readFileSync(join(ROOT, "data/restaurants/catalog.json"), "utf8"),
);
const templates = JSON.parse(
  readFileSync(join(ROOT, "data/restaurants/saved-meals.json"), "utf8"),
);

const itemById = new Map(catalog.items.map((item) => [item.id, item]));

function toComponent({ id, servings }) {
  const item = itemById.get(id);
  if (!item) throw new Error(`Unknown restaurant item: ${id}`);
  return {
    name: `${item.name} · ${item.restaurant}`,
    source: "restaurant",
    food_id: item.id,
    serving_size_g: item.serving_size_g,
    servings,
    nutrients: item.nutrients,
  };
}

async function main() {
  const { data: existing, error: listError } = await db
    .from("saved_meals")
    .select("id, name, sort_order")
    .order("sort_order", { ascending: false })
    .limit(1);
  if (listError) throw new Error(listError.message);

  let sortOrder = existing?.[0]?.sort_order ?? 0;
  const { data: allExisting } = await db.from("saved_meals").select("id, name");
  const existingByName = new Map((allExisting ?? []).map((row) => [row.name, row.id]));

  for (const template of templates) {
    const components = template.components.map(toComponent);
    const existingId = existingByName.get(template.name);

    if (existingId) {
      const { error } = await db
        .from("saved_meals")
        .update({ components })
        .eq("id", existingId);
      if (error) throw new Error(`${template.name}: ${error.message}`);
      console.log(`↻ Updated: ${template.name} (${components.length} items)`);
      continue;
    }

    sortOrder += 1;

    const { error } = await db.from("saved_meals").insert({
      name: template.name,
      components,
      sort_order: sortOrder,
    });
    if (error) throw new Error(`${template.name}: ${error.message}`);
    console.log(`✓ Added: ${template.name} (${components.length} items)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
