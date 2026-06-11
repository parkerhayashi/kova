/**
 * ExerciseDB catalog — server-side only.
 *
 * Sync merges the free OSS catalog (~1,500 GIFs) with RapidAPI v2 when
 * EXERCISEDB_RAPIDAPI_KEY is set. Set EXERCISEDB_API_VERSION=v1 for v1 instead.
 */

const OSS_BASE = "https://oss.exercisedb.dev/api/v1";
const V1_HOST = "edb-with-gifs-and-images-by-ascendapi.p.rapidapi.com";
const V2_HOST = "edb-with-videos-and-images-by-ascendapi.p.rapidapi.com";

export type ExerciseDbRecord = {
  exerciseId: string;
  name: string;
  gifUrl: string;
  bodyParts: string[];
  equipments: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
};

type RawExerciseDbRecord = {
  exerciseId: string;
  name: string;
  gifUrl?: string;
  gifUrls?: Partial<Record<"360p" | "480p" | "720p" | "1080p", string>>;
  imageUrl?: string;
  imageUrls?: Partial<Record<"360p" | "480p" | "720p" | "1080p", string>>;
  bodyParts?: string[];
  equipments?: string[];
  targetMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
};

type ListResponse = {
  success: boolean;
  meta?: {
    nextCursor?: string | null;
    hasNextPage?: boolean;
    total?: number;
  };
  data: RawExerciseDbRecord[];
};

type SingleResponse = {
  success: boolean;
  data: RawExerciseDbRecord;
};

type ExerciseDbClient = {
  base: string;
  headers: Record<string, string>;
  mode: "rapidapi" | "oss";
  apiVersion: "v1" | "v2" | null;
};

const OSS_CLIENT: ExerciseDbClient = {
  base: OSS_BASE,
  headers: { Accept: "application/json" },
  mode: "oss",
  apiVersion: null,
};

function getRapidApiClient(): ExerciseDbClient | null {
  const key = process.env.EXERCISEDB_RAPIDAPI_KEY?.trim();
  if (!key) return null;

  const version =
    process.env.EXERCISEDB_API_VERSION?.trim().toLowerCase() === "v1"
      ? "v1"
      : "v2";
  const host = version === "v1" ? V1_HOST : V2_HOST;
  return {
    base: `https://${host}/api/v1`,
    headers: {
      Accept: "application/json",
      "X-RapidAPI-Key": key,
      "X-RapidAPI-Host": host,
    },
    mode: "rapidapi",
    apiVersion: version,
  };
}

function getExerciseDbClient(): ExerciseDbClient {
  return getRapidApiClient() ?? OSS_CLIENT;
}

export function titleCaseName(name: string): string {
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

function pickMediaUrl(raw: RawExerciseDbRecord): string {
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

function normalizeList(raw: string[] | undefined): string[] {
  return (raw ?? []).map((value) => titleCaseName(value));
}

export function normalizeExerciseDbRecord(raw: RawExerciseDbRecord): ExerciseDbRecord {
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

/** Map ExerciseDB body part to Kova exercise category. */
export function mapBodyPartToCategory(bodyPart: string | undefined): string {
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

export function normalizeExerciseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function toCatalogRow(record: ExerciseDbRecord) {
  const bodyPart = record.bodyParts[0] ?? null;
  return {
    exercisedb_id: record.exerciseId,
    name: record.name,
    gif_url: record.gifUrl,
    body_part: bodyPart,
    equipment: record.equipments[0] ?? null,
    target_muscle: record.targetMuscles[0] ?? null,
    secondary_muscles: record.secondaryMuscles,
    instructions: record.instructions,
    category: mapBodyPartToCategory(bodyPart ?? undefined),
    synced_at: new Date().toISOString(),
  };
}

export function toExerciseFields(record: ExerciseDbRecord) {
  const bodyPart = record.bodyParts[0] ?? null;
  return {
    exercisedb_id: record.exerciseId,
    name: record.name,
    gif_url: record.gifUrl,
    body_part: bodyPart,
    equipment: record.equipments[0] ?? null,
    target_muscle: record.targetMuscles[0] ?? null,
    secondary_muscles: record.secondaryMuscles,
    instructions: record.instructions,
    category: mapBodyPartToCategory(bodyPart ?? undefined),
  };
}

export function toCatalogItem(record: ExerciseDbRecord): {
  exercisedb_id: string;
  name: string;
  gif_url: string;
  body_part: string | null;
  equipment: string | null;
  target_muscle: string | null;
  secondary_muscles: string[];
  instructions: string[];
  category: string;
} {
  return toExerciseFields(record);
}

function isRapidApiExerciseId(exerciseId: string): boolean {
  return exerciseId.startsWith("exr_") || exerciseId.startsWith("edb_");
}

export function preferCatalogRecord(
  a: ExerciseDbRecord,
  b: ExerciseDbRecord,
): ExerciseDbRecord {
  const aRapid = isRapidApiExerciseId(a.exerciseId);
  const bRapid = isRapidApiExerciseId(b.exerciseId);
  if (aRapid !== bRapid) return aRapid ? a : b;
  if (a.instructions.length !== b.instructions.length) {
    return a.instructions.length > b.instructions.length ? a : b;
  }
  if (Boolean(a.gifUrl) !== Boolean(b.gifUrl)) {
    return a.gifUrl ? a : b;
  }
  return a;
}

export function dedupeCatalogItems<
  T extends {
    exercisedb_id: string;
    name: string;
    instructions: string[];
  },
>(items: T[]): T[] {
  const byName = new Map<string, T>();
  for (const item of items) {
    const key = normalizeExerciseName(item.name);
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, item);
      continue;
    }
    const pick =
      isRapidApiExerciseId(item.exercisedb_id) &&
      !isRapidApiExerciseId(existing.exercisedb_id)
        ? item
        : item.instructions.length > existing.instructions.length
          ? item
          : existing;
    byName.set(key, pick);
  }
  return [...byName.values()];
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(
  client: ExerciseDbClient,
  path: string,
  params?: URLSearchParams,
  revalidate = 86400,
): Promise<T> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = params
      ? `${client.base}${path}?${params}`
      : `${client.base}${path}`;
    const res = await fetch(url, {
      headers: client.headers,
      next: { revalidate },
    });
    if (res.status === 429) {
      await sleep(5000 * (attempt + 1));
      continue;
    }
    if (!res.ok) {
      throw new Error(`ExerciseDB ${res.status}: ${url}`);
    }
    return res.json() as Promise<T>;
  }
  throw new Error(`ExerciseDB rate limit: ${path}`);
}

async function fetchExerciseDbPage(
  client: ExerciseDbClient,
  params: URLSearchParams,
): Promise<ListResponse> {
  return fetchJson<ListResponse>(client, "/exercises", params, 0);
}

async function fetchOssTaxonomy(path: "/bodyparts" | "/equipments" | "/muscles") {
  const json = await fetchJson<{ data: Array<string | { name: string }> }>(
    OSS_CLIENT,
    path,
    undefined,
    0,
  );
  return (json.data ?? []).map((entry) =>
    typeof entry === "string" ? entry : entry.name,
  );
}

async function harvestOssByFilter(
  filterKey: "bodyParts" | "equipments" | "targetMuscles",
  value: string,
  onProgress?: (count: number) => void,
): Promise<ExerciseDbRecord[]> {
  const records: ExerciseDbRecord[] = [];
  const seen = new Set<string>();
  let after: string | null = null;

  for (;;) {
    const params = new URLSearchParams({
      [filterKey]: value,
      limit: "100",
    });
    if (after) params.set("after", after);
    const json = await fetchExerciseDbPage(OSS_CLIENT, params);
    let added = 0;
    for (const row of json.data ?? []) {
      if (seen.has(row.exerciseId)) continue;
      seen.add(row.exerciseId);
      records.push(normalizeExerciseDbRecord(row));
      added += 1;
    }
    onProgress?.(records.length);

    if (!json.meta?.hasNextPage || !json.meta.nextCursor || added === 0) break;
    after = json.meta.nextCursor;
    await sleep(400);
  }

  return records;
}

/** Harvest the full free OSS catalog via taxonomy filters + after pagination. */
export async function fetchAllOssRecords(
  onProgress?: (label: string, count: number) => void,
): Promise<ExerciseDbRecord[]> {
  const byId = new Map<string, ExerciseDbRecord>();

  const filters: Array<[ "bodyParts" | "equipments" | "targetMuscles", string[] ]> = [
    ["bodyParts", await fetchOssTaxonomy("/bodyparts")],
    ["equipments", await fetchOssTaxonomy("/equipments")],
    ["targetMuscles", await fetchOssTaxonomy("/muscles")],
  ];

  for (const [filterKey, values] of filters) {
    for (const value of values) {
      const batch = await harvestOssByFilter(filterKey, value, (count) =>
        onProgress?.(`${filterKey}:${value}`, count),
      );
      for (const record of batch) {
        byId.set(record.exerciseId, record);
      }
      onProgress?.(`${filterKey}:${value}`, byId.size);
      await sleep(600);
    }
  }

  return [...byId.values()];
}

async function fetchAllViaRapidApi(
  client: ExerciseDbClient,
  onPage?: (count: number, total?: number) => void,
): Promise<ExerciseDbRecord[]> {
  const all: ExerciseDbRecord[] = [];
  let after: string | null = null;

  for (;;) {
    const params = new URLSearchParams({ limit: "25" });
    if (after) params.set("after", after);
    const json = await fetchExerciseDbPage(client, params);
    for (const row of json.data ?? []) {
      all.push(normalizeExerciseDbRecord(row));
    }
    onPage?.(all.length, json.meta?.total);

    if (!json.meta?.hasNextPage || !json.meta.nextCursor) break;
    after = json.meta.nextCursor;
    await sleep(300);
  }

  return all;
}

/** Merge OSS catalog with RapidAPI when configured. */
export async function fetchAllExerciseDbRecords(
  onProgress?: (label: string, count: number) => void,
): Promise<ExerciseDbRecord[]> {
  const byId = new Map<string, ExerciseDbRecord>();

  onProgress?.("oss", 0);
  for (const record of await fetchAllOssRecords(onProgress)) {
    byId.set(record.exerciseId, record);
  }

  const rapidClient = getRapidApiClient();
  if (rapidClient) {
    for (const record of await fetchAllViaRapidApi(rapidClient, (count) =>
      onProgress?.("rapidapi", count),
    )) {
      byId.set(record.exerciseId, record);
    }
  }

  return [...byId.values()];
}

export async function fetchExerciseDbById(
  exerciseId: string,
): Promise<ExerciseDbRecord | null> {
  const clients: ExerciseDbClient[] = isRapidApiExerciseId(exerciseId)
    ? [getRapidApiClient(), OSS_CLIENT].filter(Boolean) as ExerciseDbClient[]
    : [OSS_CLIENT, getRapidApiClient()].filter(Boolean) as ExerciseDbClient[];

  for (const client of clients) {
    try {
      const json = await fetchJson<SingleResponse>(
        client,
        `/exercises/${encodeURIComponent(exerciseId)}`,
        undefined,
        0,
      );
      if (json.data) return normalizeExerciseDbRecord(json.data);
    } catch {
      // try next source
    }
  }
  return null;
}

async function searchOssByName(query: string, limit: number) {
  const params = new URLSearchParams({ name: query, limit: String(limit) });
  const json = await fetchExerciseDbPage(OSS_CLIENT, params);
  return (json.data ?? []).map(normalizeExerciseDbRecord);
}

async function searchRapidByName(client: ExerciseDbClient, query: string, limit: number) {
  if (client.apiVersion === "v2") {
    const params = new URLSearchParams({ search: query });
    const json = await fetchJson<ListResponse>(
      client,
      "/exercises/search",
      params,
      0,
    );
    return (json.data ?? []).map(normalizeExerciseDbRecord).slice(0, limit);
  }

  const params = new URLSearchParams({ name: query, limit: String(limit) });
  const json = await fetchExerciseDbPage(client, params);
  return (json.data ?? []).map(normalizeExerciseDbRecord);
}

/** Search live APIs (OSS + RapidAPI when configured), deduped by name. */
export async function searchExerciseDbByName(
  query: string,
  limit = 20,
): Promise<ExerciseDbRecord[]> {
  const q = query.trim();
  if (!q) return [];

  const byName = new Map<string, ExerciseDbRecord>();
  const ossHits = await searchOssByName(q, limit);
  for (const record of ossHits) {
    byName.set(normalizeExerciseName(record.name), record);
  }

  const rapidClient = getRapidApiClient();
  if (rapidClient) {
    const rapidHits = await searchRapidByName(rapidClient, q, limit);
    for (const record of rapidHits) {
      const key = normalizeExerciseName(record.name);
      const existing = byName.get(key);
      byName.set(
        key,
        existing ? preferCatalogRecord(existing, record) : record,
      );
    }
  }

  return [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}

export function isExerciseDbRapidApiConfigured(): boolean {
  return Boolean(process.env.EXERCISEDB_RAPIDAPI_KEY?.trim());
}
