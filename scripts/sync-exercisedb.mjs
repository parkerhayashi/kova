#!/usr/bin/env node
/**
 * Sync merged ExerciseDB catalog into exercise_catalog and link local exercises.
 *
 * Usage: node --env-file=.env.local scripts/sync-exercisedb.mjs
 *
 * Always harvests the free OSS catalog (~1,500 exercises). When
 * EXERCISEDB_RAPIDAPI_KEY is set, also merges the RapidAPI v2 slice.
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

const ossClient = {
  base: OSS_BASE,
  headers: { Accept: "application/json" },
};

const rapidClient = rapidApiKey
  ? {
      base: `https://${apiVersion === "v1" ? V1_HOST : V2_HOST}/api/v1`,
      headers: {
        Accept: "application/json",
        "X-RapidAPI-Key": rapidApiKey,
        "X-RapidAPI-Host": apiVersion === "v1" ? V1_HOST : V2_HOST,
      },
      apiVersion,
    }
  : null;

const db = createClient(url, serviceKey);

function titleCaseName(name) {
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((word) =>
      word
        .split("-")
        .map((part) =>
          part ? part.charAt(0).toUpperCase() + part.slice(1) : part,
        )
        .join("-"),
    )
    .join(" ");
}

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
  return (values ?? []).map((value) => titleCaseName(value));
}

function normalizeRecord(raw) {
  return {
    exerciseId: raw.exerciseId,
    name: titleCaseName(raw.name),
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

function isRapidApiExerciseId(exerciseId) {
  return exerciseId.startsWith("exr_") || exerciseId.startsWith("edb_");
}

function preferRecord(a, b) {
  const aRapid = isRapidApiExerciseId(a.exerciseId);
  const bRapid = isRapidApiExerciseId(b.exerciseId);
  if (aRapid !== bRapid) return aRapid ? a : b;
  if (a.instructions.length !== b.instructions.length) {
    return a.instructions.length > b.instructions.length ? a : b;
  }
  if (Boolean(a.gifUrl) !== Boolean(b.gifUrl)) return a.gifUrl ? a : b;
  return a;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(client, path, params) {
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

async function fetchOssTaxonomy(path) {
  const json = await fetchPage(ossClient, path);
  return (json.data ?? []).map((entry) =>
    typeof entry === "string" ? entry : entry.name,
  );
}

async function harvestOssByFilter(filterKey, value) {
  const records = [];
  const seen = new Set();
  let after = null;

  for (;;) {
    const params = new URLSearchParams({ [filterKey]: value, limit: "100" });
    if (after) params.set("after", after);
    const json = await fetchPage(ossClient, "/exercises", params);
    let added = 0;
    for (const row of json.data ?? []) {
      if (seen.has(row.exerciseId)) continue;
      seen.add(row.exerciseId);
      records.push(normalizeRecord(row));
      added += 1;
    }
    if (!json.meta?.hasNextPage || !json.meta.nextCursor || added === 0) break;
    after = json.meta.nextCursor;
    await sleep(400);
  }

  return records;
}

async function fetchAllOssRecords() {
  const byId = new Map();
  const filters = [
    ["bodyParts", await fetchOssTaxonomy("/bodyparts")],
    ["equipments", await fetchOssTaxonomy("/equipments")],
    ["targetMuscles", await fetchOssTaxonomy("/muscles")],
  ];

  for (const [filterKey, values] of filters) {
    for (const value of values) {
      const batch = await harvestOssByFilter(filterKey, value);
      let added = 0;
      for (const record of batch) {
        if (byId.has(record.exerciseId)) continue;
        byId.set(record.exerciseId, record);
        added += 1;
      }
      process.stdout.write(
        `\rOSS ${filterKey} "${value}" → ${byId.size} total (+${added})…`,
      );
      await sleep(600);
    }
  }
  console.log();
  return [...byId.values()];
}

async function fetchAllRapidRecords() {
  const all = [];
  let after = null;

  for (;;) {
    const params = new URLSearchParams({ limit: "25" });
    if (after) params.set("after", after);
    const json = await fetchPage(rapidClient, "/exercises", params);
    for (const row of json.data ?? []) {
      all.push(normalizeRecord(row));
    }
    process.stdout.write(
      `\rRapidAPI ${all.length} / ${json.meta?.total ?? "?"} exercises…`,
    );

    if (!json.meta?.hasNextPage || !json.meta.nextCursor) break;
    after = json.meta.nextCursor;
    await sleep(300);
  }
  console.log();
  return all;
}

async function fetchAllRecords() {
  console.log("Harvesting free OSS catalog (body parts, equipment, muscles)…");
  const byId = new Map();
  for (const record of await fetchAllOssRecords()) {
    byId.set(record.exerciseId, record);
  }
  console.log(`OSS catalog: ${byId.size} exercises`);

  if (rapidClient) {
    console.log(`Merging ExerciseDB ${rapidClient.apiVersion} RapidAPI…`);
    for (const record of await fetchAllRapidRecords()) {
      byId.set(record.exerciseId, record);
    }
  }

  return [...byId.values()];
}

function findExactMatch(localName, catalogByNorm) {
  return catalogByNorm.get(normalizeName(localName)) ?? null;
}

function buildLinkIndex(rows) {
  const byNorm = new Map();
  for (const row of rows) {
    const key = normalizeName(row.name);
    const existing = byNorm.get(key);
    if (!existing) {
      byNorm.set(key, row);
      continue;
    }
    const prefer =
      isRapidApiExerciseId(row.exercisedb_id) &&
      !isRapidApiExerciseId(existing.exercisedb_id)
        ? row
        : existing;
    byNorm.set(key, prefer);
  }
  return byNorm;
}

async function main() {
  const records = await fetchAllRecords();
  const rows = records.map(toCatalogRow);

  console.log(`Upserting ${rows.length} merged rows into exercise_catalog…`);
  const CHUNK = 100;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await db
      .from("exercise_catalog")
      .upsert(chunk, { onConflict: "exercisedb_id" });
    if (error) throw error;
  }

  const catalogByNorm = buildLinkIndex(rows);

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
