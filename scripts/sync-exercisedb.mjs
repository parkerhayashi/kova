#!/usr/bin/env node
/**
 * Sync ExerciseDB catalog into exercise_catalog and link local exercises.
 *
 * Usage: node --env-file=.env.local scripts/sync-exercisedb.mjs
 *
 * Set EXERCISEDB_RAPIDAPI_KEY for RapidAPI (defaults to v2).
 * Set EXERCISEDB_API_VERSION=v1 for the v1 product instead.
 * Without a key, falls back to free oss.exercisedb.dev keyword harvest.
 */

import { createClient } from "@supabase/supabase-js";

const OSS_BASE = "https://oss.exercisedb.dev/api/v1";
const V1_HOST = "edb-with-gifs-and-images-by-ascendapi.p.rapidapi.com";
const V2_HOST = "edb-with-videos-and-images-by-ascendapi.p.rapidapi.com";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const rapidApiKey = process.env.EXERCISEDB_RAPIDAPI_KEY?.trim();
const apiVersion =
  process.env.EXERCISEDB_API_VERSION?.trim().toLowerCase() === "v1"
    ? "v1"
    : "v2";

const client = rapidApiKey
  ? {
      base: `https://${apiVersion === "v1" ? V1_HOST : V2_HOST}/api/v1`,
      headers: {
        Accept: "application/json",
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": apiVersion === "v1" ? V1_HOST : V2_HOST,
      },
      mode: "rapidapi",
      apiVersion,
    }
  : {
      base: OSS_BASE,
      headers: { Accept: "application/json" },
      mode: "oss",
      apiVersion: null,
    };

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
    case "legs":
      return "legs";
    case "upper arms":
    case "lower arms":
    case "arms":
      return "arms";
    case "waist":
    case "core":
      return "core";
    case "cardio":
      return "cardio";
    default:
      return "other";
  }
}

function pickMediaUrl(raw) {
  if (raw.gifUrl) return raw.gifUrl;
  if (raw.gifUrls) {
    return (
      raw.gifUrls["480p"] ??
      raw.gifUrls["360p"] ??
      raw.gifUrls["720p"] ??
      raw.gifUrls["1080p"] ??
      ""
    );
  }
  if (raw.imageUrl) return raw.imageUrl;
  if (raw.imageUrls) {
    return (
      raw.imageUrls["480p"] ??
      raw.imageUrls["360p"] ??
      raw.imageUrls["720p"] ??
      raw.imageUrls["1080p"] ??
      ""
    );
  }
  return "";
}

function normalizeList(values) {
  return (values ?? []).map((value) =>
    value.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase()),
  );
}

function normalizeRecord(raw) {
  return {
    exerciseId: raw.exerciseId,
    name: raw.name.trim(),
    gifUrl: pickMediaUrl(raw),
    bodyParts: normalizeList(raw.bodyParts),
    equipments: normalizeList(raw.equipments),
    targetMuscles: normalizeList(raw.targetMuscles),
    secondaryMuscles: normalizeList(raw.secondaryMuscles),
    instructions: raw.instructions ?? [],
  };
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

async function fetchPage(path, params) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = params
      ? `${client.base}${path}?${params}`
      : `${client.base}${path}`;
    const res = await fetch(url, { headers: client.headers });
    if (res.status === 429) {
      const wait = 5000 * (attempt + 1);
      console.log(`\nRate limited — waiting ${wait / 1000}s…`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ExerciseDB fetch failed: ${res.status} ${body.slice(0, 200)}`);
    }
    return res.json();
  }
  throw new Error("ExerciseDB rate limit — try again in a few minutes");
}

async function fetchAllViaRapidApi() {
  const all = [];
  let after = null;

  for (;;) {
    const params = new URLSearchParams({ limit: "25" });
    if (after) params.set("after", after);
    const json = await fetchPage("/exercises", params);
    for (const row of json.data ?? []) {
      all.push(normalizeRecord(row));
    }
    process.stdout.write(
      `\rListed ${all.length} / ${json.meta?.total ?? "?"} exercises…`,
    );

    if (!json.meta?.hasNextPage || !json.meta.nextCursor) break;
    after = json.meta.nextCursor;
    await sleep(300);
  }
  console.log();
  return all;
}

const OSS_SEARCH_TERMS = [
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

async function fetchAllViaOssHarvest() {
  const all = [];
  const seen = new Set();

  for (const term of OSS_SEARCH_TERMS) {
    const params = new URLSearchParams({ name: term, limit: "100" });
    const json = await fetchPage("/exercises", params);
    let added = 0;
    for (const row of json.data ?? []) {
      if (seen.has(row.exerciseId)) continue;
      seen.add(row.exerciseId);
      all.push(normalizeRecord(row));
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

async function fetchAllRecords() {
  if (client.mode === "rapidapi") {
    console.log(`Using ExerciseDB ${client.apiVersion} RapidAPI…`);
    return fetchAllViaRapidApi();
  }
  console.log("No EXERCISEDB_RAPIDAPI_KEY — using free OSS keyword harvest…");
  return fetchAllViaOssHarvest();
}

function findExactMatch(localName, catalogByNorm) {
  return catalogByNorm.get(normalizeName(localName)) ?? null;
}

async function main() {
  console.log("Fetching ExerciseDB catalog…");
  const records = await fetchAllRecords();
  const rows = records.map(toCatalogRow);

  if (client.mode === "rapidapi") {
    console.log("Replacing exercise_catalog with RapidAPI snapshot…");
    const { error: clearError } = await db
      .from("exercise_catalog")
      .delete()
      .neq("exercisedb_id", "");
    if (clearError) throw clearError;
  }

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
  const usedIds = new Set();

  for (const ex of localExercises ?? []) {
    const match = findExactMatch(ex.name, catalogByNorm);
    if (!match) continue;

    const sameId = ex.exercisedb_id === match.exercisedb_id;
    const alreadyUsed = usedIds.has(match.exercisedb_id);
    if (sameId || alreadyUsed) {
      if (ex.exercisedb_id) usedIds.add(ex.exercisedb_id);
      continue;
    }

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
