/**
 * ExerciseDB open catalog (https://oss.exercisedb.dev) — server-side only.
 * GIFs are served from static.exercisedb.dev (no API key required).
 */

const EXERCISEDB_BASE = "https://oss.exercisedb.dev/api/v1";

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

type ListResponse = {
  success: boolean;
  meta?: { nextCursor?: string | null; total?: number };
  data: ExerciseDbRecord[];
};

type SingleResponse = {
  success: boolean;
  data: ExerciseDbRecord;
};

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

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    next: { revalidate: 86400 },
  });
  if (!res.ok) {
    throw new Error(`ExerciseDB ${res.status}: ${url}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchExerciseDbById(
  exerciseId: string,
): Promise<ExerciseDbRecord | null> {
  try {
    const json = await fetchJson<SingleResponse>(
      `${EXERCISEDB_BASE}/exercises/${encodeURIComponent(exerciseId)}`,
    );
    return json.data ?? null;
  } catch {
    return null;
  }
}

/** Paginate the full catalog (1500 exercises). */
export async function fetchAllExerciseDbRecords(
  onPage?: (count: number, total?: number) => void,
): Promise<ExerciseDbRecord[]> {
  const all: ExerciseDbRecord[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let expectedTotal: number | undefined;

  for (;;) {
    const params = new URLSearchParams({ limit: "25" });
    if (cursor) params.set("cursor", cursor);
    const json = await fetchJson<ListResponse>(
      `${EXERCISEDB_BASE}/exercises?${params}`,
    );
    if (expectedTotal == null && json.meta?.total) {
      expectedTotal = json.meta.total;
    }

    let added = 0;
    for (const row of json.data) {
      if (seen.has(row.exerciseId)) continue;
      seen.add(row.exerciseId);
      all.push(row);
      added += 1;
    }
    onPage?.(all.length, expectedTotal);

    cursor = json.meta?.nextCursor ?? null;
    if (!cursor || json.data.length === 0 || added === 0) break;
    if (expectedTotal != null && all.length >= expectedTotal) break;
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
  const params = new URLSearchParams({ name: q, limit: String(limit) });
  const json = await fetchJson<ListResponse>(
    `${EXERCISEDB_BASE}/exercises?${params}`,
  );
  return json.data ?? [];
}
