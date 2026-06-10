#!/usr/bin/env node
/**
 * Sync ExerciseDB catalog into exercise_catalog and link local exercises.
 *
 * Usage: node --env-file=.env.local scripts/sync-exercisedb.mjs
 */

import { createClient } from "@supabase/supabase-js";

const EXERCISEDB_BASE = "https://oss.exercisedb.dev/api/v1";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient(url, serviceKey);

function mapBodyPartToCategory(bodyPart) {
  switch ((bodyPart ?? "").toLowerCase()) {
    case "chest":
      return "chest";
    case "back":
      return "back";
    case "shoulders":
      return "shoulders";
    case "upper legs":
    case "lower legs":
      return "legs";
    case "upper arms":
    case "lower arms":
      return "arms";
    case "waist":
      return "core";
    case "cardio":
      return "cardio";
    default:
      return "other";
  }
}

function toCatalogRow(record) {
  const bodyPart = record.bodyParts?.[0] ?? null;
  return {
    exercisedb_id: record.exerciseId,
    name: record.name,
    gif_url: record.gifUrl,
    body_part: bodyPart,
    equipment: record.equipments?.[0] ?? null,
    target_muscle: record.targetMuscles?.[0] ?? null,
    secondary_muscles: record.secondaryMuscles ?? [],
    instructions: record.instructions ?? [],
    category: mapBodyPartToCategory(bodyPart),
    synced_at: new Date().toISOString(),
  };
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(params) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const res = await fetch(`${EXERCISEDB_BASE}/exercises?${params}`);
    if (res.status === 429) {
      const wait = 5000 * (attempt + 1);
      console.log(`\nRate limited — waiting ${wait / 1000}s…`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`ExerciseDB fetch failed: ${res.status}`);
    return res.json();
  }
  throw new Error("ExerciseDB rate limit — try again in a few minutes");
}

const SEARCH_TERMS = [
  "barbell",
  "dumbbell",
  "cable",
  "machine",
  "band",
  "kettlebell",
  "bodyweight",
  "smith",
  "press",
  "bench",
  "squat",
  "deadlift",
  "row",
  "curl",
  "raise",
  "fly",
  "extension",
  "crunch",
  "plank",
  "pull",
  "push",
  "lunge",
  "hip",
  "calf",
  "shrug",
  "dip",
  "pulldown",
  "pushdown",
  "thrust",
  "step",
  "run",
  "walk",
  "stretch",
  "rotation",
  "twist",
  "hold",
  "clean",
  "snatch",
  "swing",
  "cardio",
];

async function fetchBySearch(term) {
  const params = new URLSearchParams({ name: term, limit: "100" });
  const json = await fetchPage(params);
  return json.data ?? [];
}

async function fetchAllRecords() {
  const all = [];
  const seen = new Set();

  for (const term of SEARCH_TERMS) {
    const batch = await fetchBySearch(term);
    let added = 0;
    for (const row of batch) {
      if (seen.has(row.exerciseId)) continue;
      seen.add(row.exerciseId);
      all.push(row);
      added += 1;
    }
    process.stdout.write(
      `\rHarvested ${all.length} exercises (term "${term}" +${added})…`,
    );
    await sleep(800);
  }
  console.log();
  return all;
}

function findExactMatch(localName, catalogByNorm) {
  return catalogByNorm.get(normalizeName(localName)) ?? null;
}

async function main() {
  console.log("Fetching ExerciseDB catalog…");
  const records = await fetchAllRecords();
  const rows = records.map(toCatalogRow);

  console.log(`Upserting ${rows.length} rows into exercise_catalog…`);
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await db
      .from("exercise_catalog")
      .upsert(chunk, { onConflict: "exercisedb_id" });
    if (error) throw error;
  }

  const catalogByNorm = new Map(rows.map((r) => [normalizeName(r.name), r]));

  const { data: localExercises, error: localErr } = await db
    .from("exercises")
    .select("id, name, exercisedb_id");
  if (localErr) throw localErr;

  let linked = 0;
  const usedIds = new Set(
    (localExercises ?? [])
      .map((e) => e.exercisedb_id)
      .filter(Boolean),
  );

  for (const ex of localExercises ?? []) {
    if (ex.exercisedb_id) continue;
    const match = findExactMatch(ex.name, catalogByNorm);
    if (!match || usedIds.has(match.exercisedb_id)) continue;

    const { error } = await db
      .from("exercises")
      .update({
        exercisedb_id: match.exercisedb_id,
        gif_url: match.gif_url,
        body_part: match.body_part,
        equipment: match.equipment ?? undefined,
        target_muscle: match.target_muscle,
        secondary_muscles: match.secondary_muscles,
        instructions: match.instructions,
        category: match.category,
      })
      .eq("id", ex.id);
    if (error) {
      console.warn(`  Skip "${ex.name}": ${error.message}`);
      continue;
    }
    usedIds.add(match.exercisedb_id);
    linked += 1;
    console.log(`  Linked "${ex.name}" → ${match.name}`);
  }

  console.log(`✓ Catalog synced (${rows.length} exercises, ${linked} local links)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
