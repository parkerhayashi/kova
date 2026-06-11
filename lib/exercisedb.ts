/**
 * ExerciseDB catalog — server-side only.
 *
 * RapidAPI: set EXERCISEDB_RAPIDAPI_KEY (defaults to v2; set EXERCISEDB_API_VERSION=v1 for v1).
 * Free fallback: oss.exercisedb.dev (no key; broken cursor pagination).
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

function getExerciseDbClient(): ExerciseDbClient {
  const key = process.env.EXERCISEDB_RAPIDAPI_KEY?.trim();
  if (key) {
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
  return {
    base: OSS_BASE,
    headers: { Accept: "application/json" },
    mode: "oss",
    apiVersion: null,
  };
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
  return (raw ?? []).map((value) =>
    value
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase()),
  );
}

export function normalizeExerciseDbRecord(raw: RawExerciseDbRecord): ExerciseDbRecord {
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

async function fetchJson<T>(
  client: ExerciseDbClient,
  path: string,
  params?: URLSearchParams,
  revalidate = 86400,
): Promise<T> {
  const url = params
    ? `${client.base}${path}?${params}`
    : `${client.base}${path}`;
  const res = await fetch(url, {
    headers: client.headers,
    next: { revalidate },
  });
  if (!res.ok) {
    throw new Error(`ExerciseDB ${res.status}: ${url}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchExerciseDbById(
  exerciseId: string,
): Promise<ExerciseDbRecord | null> {
  const client = getExerciseDbClient();
  try {
    const json = await fetchJson<SingleResponse>(
      client,
      `/exercises/${encodeURIComponent(exerciseId)}`,
      undefined,
      0,
    );
    return json.data ? normalizeExerciseDbRecord(json.data) : null;
  } catch {
    return null;
  }
}

async function fetchExerciseDbPage(
  client: ExerciseDbClient,
  params: URLSearchParams,
): Promise<ListResponse> {
  return fetchJson<ListResponse>(client, "/exercises", params, 0);
}

/** Paginate the RapidAPI catalog. Falls back to keyword harvest on free OSS tier. */
export async function fetchAllExerciseDbRecords(
  onPage?: (count: number, total?: number) => void,
): Promise<ExerciseDbRecord[]> {
  const client = getExerciseDbClient();
  if (client.mode === "rapidapi") {
    return fetchAllViaRapidApi(client, onPage);
  }
  return fetchAllViaOssHarvest(onPage);
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
  }

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

async function fetchAllViaOssHarvest(
  onPage?: (count: number, total?: number) => void,
): Promise<ExerciseDbRecord[]> {
  const client = getExerciseDbClient();
  const all: ExerciseDbRecord[] = [];
  const seen = new Set<string>();

  for (const term of OSS_SEARCH_TERMS) {
    const params = new URLSearchParams({ name: term, limit: "100" });
    const json = await fetchExerciseDbPage(client, params);
    for (const row of json.data ?? []) {
      if (seen.has(row.exerciseId)) continue;
      seen.add(row.exerciseId);
      all.push(normalizeExerciseDbRecord(row));
    }
    onPage?.(all.length);
    await new Promise((r) => setTimeout(r, 800));
  }

  return all;
}

/** Search by name via ExerciseDB API (fallback when catalog table is empty). */
export async function searchExerciseDbByName(
  query: string,
  limit = 20,
): Promise<ExerciseDbRecord[]> {
  const q = query.trim();
  if (!q) return [];
  const client = getExerciseDbClient();

  if (client.apiVersion === "v2") {
    const params = new URLSearchParams({ search: q });
    const json = await fetchJson<ListResponse>(
      client,
      "/exercises/search",
      params,
      0,
    );
    return (json.data ?? []).map(normalizeExerciseDbRecord).slice(0, limit);
  }

  const params = new URLSearchParams({ name: q, limit: String(limit) });
  const json = await fetchExerciseDbPage(client, params);
  return (json.data ?? []).map(normalizeExerciseDbRecord);
}

export function isExerciseDbRapidApiConfigured(): boolean {
  return Boolean(process.env.EXERCISEDB_RAPIDAPI_KEY?.trim());
}
