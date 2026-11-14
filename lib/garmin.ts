/**
 * Garmin Connect Personal API client (server-only).
 *
 * Auth: GARMIN_API_KEY is exchanged for a 24-hour bearer token. The API is
 * pull-only — Kova polls it (daily cron + a background sync when the app is
 * opened). Runs come from the activity search (summary metrics) plus each
 * run's .FIT file (laps and the per-second trace).
 *
 * Docs: https://developer.garmin.com/gc-developer-program/personal/swagger-docs/
 */
import { Decoder, Stream } from "@garmin/fitsdk";
import { unzipSync } from "fflate";
import type { IncomingRun, IncomingRunDetail } from "@/lib/data/running";
import type {
  GarminActivity,
  GarminSport,
  RunLap,
  RunMetrics,
  RunStreamPoints,
  WeightMetrics,
} from "@/types";

const BASE = "https://personal.connectapi.garmin.com";
const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
/** Re-fetch the token this long before it expires. */
const TOKEN_MARGIN_MS = 5 * 60_000;
/** Activity search page size (API maximum is 99). */
const PAGE_SIZE = 99;
/** Trace points kept per run — enough for a smooth chart, small enough for jsonb. */
const STREAM_POINTS = 300;

export function isGarminConfigured(): boolean {
  return Boolean(process.env.GARMIN_API_KEY);
}

export class GarminAuthError extends Error {}

let cachedToken: { value: string; expiresAt: number } | null = null;

function jwtExpiry(token: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString());
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_MARGIN_MS > Date.now()) return cachedToken.value;
  const key = process.env.GARMIN_API_KEY;
  if (!key) throw new GarminAuthError("Garmin isn't connected — set GARMIN_API_KEY.");
  const res = await fetch(BASE + TOKEN_PATH, {
    method: "POST",
    headers: { Authorization: `ApiKey ${key}` },
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    throw new GarminAuthError(
      "Garmin rejected the API key — it may have expired. Create a new one in Garmin Connect.",
    );
  }
  if (!res.ok) throw new Error(`Garmin token request failed (${res.status})`);
  // The token comes back as plain text (a JWT), sometimes JSON-quoted.
  const value = (await res.text()).trim().replace(/^"|"$/g, "");
  cachedToken = { value, expiresAt: jwtExpiry(value) ?? Date.now() + 60 * 60_000 };
  return value;
}

async function garminFetch(path: string): Promise<Response> {
  const res = await fetch(BASE + path, {
    headers: { Authorization: `Bearer ${await getToken()}` },
    cache: "no-store",
  });
  if (res.status === 401) {
    cachedToken = null;
    throw new GarminAuthError("Garmin rejected the access token — the API key may have expired.");
  }
  if (!res.ok) throw new Error(`Garmin ${path.split("?")[0]} failed (${res.status})`);
  return res;
}

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

/** The activity-search fields Kova reads (the API returns many more). */
export type GarminApiActivity = {
  activityId: number;
  activityName?: string | null;
  startTimeLocal?: string | null;
  startTimeGMT?: string | null;
  activityType?: { typeKey?: string | null } | null;
  distance?: number | null;
  duration?: number | null;
  elapsedDuration?: number | null;
  movingDuration?: number | null;
  elevationGain?: number | null;
  elevationLoss?: number | null;
  minElevation?: number | null;
  maxElevation?: number | null;
  averageSpeed?: number | null;
  maxSpeed?: number | null;
  avgGradeAdjustedSpeed?: number | null;
  calories?: number | null;
  averageHR?: number | null;
  maxHR?: number | null;
  averageRunningCadenceInStepsPerMinute?: number | null;
  maxRunningCadenceInStepsPerMinute?: number | null;
  avgPower?: number | null;
  maxPower?: number | null;
  aerobicTrainingEffect?: number | null;
  anaerobicTrainingEffect?: number | null;
  trainingEffectLabel?: string | null;
  activityTrainingLoad?: number | null;
  vO2MaxValue?: number | null;
  avgStrideLength?: number | null;
  avgGroundContactTime?: number | null;
  avgVerticalOscillation?: number | null;
  avgVerticalRatio?: number | null;
  avgRespirationRate?: number | null;
  steps?: number | null;
  differenceBodyBattery?: number | null;
  moderateIntensityMinutes?: number | null;
  vigorousIntensityMinutes?: number | null;
  fastestSplit_1000?: number | null;
  fastestSplit_1609?: number | null;
  fastestSplit_5000?: number | null;
  fastestSplit_10000?: number | null;
  hrTimeInZone_1?: number | null;
  hrTimeInZone_2?: number | null;
  hrTimeInZone_3?: number | null;
  hrTimeInZone_4?: number | null;
  hrTimeInZone_5?: number | null;
  isPR?: boolean | null;
  normPower?: number | null;
  trainingStressScore?: number | null;
  intensityFactor?: number | null;
  averageBikingCadenceInRevPerMinute?: number | null;
  maxBikingCadenceInRevPerMinute?: number | null;
  totalSets?: number | null;
  totalReps?: number | null;
};

/**
 * What Kova does with a Garmin activity, by its typeKey: runs (running,
 * treadmill, trail, track…), rides (cycling, indoor_cycling, virtual_ride,
 * road / gravel / mountain biking…), strength. Everything else is ignored.
 */
export function activityKind(a: GarminApiActivity): "run" | GarminSport | null {
  const key = (a.activityType?.typeKey ?? "").toLowerCase();
  if (/run/.test(key)) return "run";
  if (/cycl|bik|ride|spin/.test(key)) return "cycling";
  if (/strength/.test(key)) return "strength";
  return null;
}

/** Runs, rides and strength sessions that started between the two local dates (inclusive). */
export async function listActivities(startDate: string, endDate: string): Promise<GarminApiActivity[]> {
  const out: GarminApiActivity[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const qs = new URLSearchParams({ start: String(start), limit: String(PAGE_SIZE), startDate, endDate });
    const page = (await (
      await garminFetch(`/activitylist-service/activities/search/activities?${qs}`)
    ).json()) as GarminApiActivity[];
    out.push(...page.filter((a) => activityKind(a) != null));
    if (page.length < PAGE_SIZE) break;
  }
  return out;
}

/** The activity's original file (.FIT), unzipped. */
export async function downloadActivityFit(activityId: number): Promise<Uint8Array> {
  const bytes = new Uint8Array(
    await (await garminFetch(`/download-service/files/activity/${activityId}`)).arrayBuffer(),
  );
  // Zip archive ("PK") holding one .fit file; fall back to the raw bytes.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    const files = unzipSync(bytes);
    const name = Object.keys(files).find((n) => /\.fit$/i.test(n)) ?? Object.keys(files)[0];
    if (!name) throw new Error(`Garmin activity ${activityId}: empty archive`);
    return files[name]!;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// .FIT parsing
// ---------------------------------------------------------------------------

type FitLap = {
  totalTimerTime?: number;
  totalDistance?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  avgRunningCadence?: number;
  avgCadence?: number;
  avgFractionalCadence?: number;
  totalAscent?: number;
  totalDescent?: number;
  avgPower?: number;
};

type FitRecord = {
  timestamp?: Date;
  heartRate?: number;
  power?: number;
  cadence?: number;
  enhancedSpeed?: number;
  speed?: number;
  enhancedAltitude?: number;
  altitude?: number;
  distance?: number;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const round = (v: number | null, places = 0): number | null =>
  v == null ? null : Math.round(v * 10 ** places) / 10 ** places;

/** FIT running cadence is strides (one foot) per minute; Kova shows steps per minute. */
function lapCadenceSpm(lap: FitLap): number | null {
  const strides = num(lap.avgRunningCadence) ?? num(lap.avgCadence);
  if (strides == null) return null;
  return round((strides + (num(lap.avgFractionalCadence) ?? 0)) * 2);
}

/** Even down-sample to at most `max` points, always keeping the last. */
function sample<T>(rows: T[], max: number): T[] {
  if (rows.length <= max) return rows;
  const step = rows.length / max;
  const out: T[] = [];
  for (let i = 0; i < max - 1; i++) out.push(rows[Math.floor(i * step)]!);
  out.push(rows[rows.length - 1]!);
  return out;
}

export function parseActivityFit(bytes: Uint8Array): {
  laps: NonNullable<IncomingRunDetail["laps"]>;
  stream: RunStreamPoints | null;
} {
  const decoder = new Decoder(Stream.fromByteArray(Array.from(bytes)));
  if (!decoder.isFIT()) throw new Error("Not a FIT file");
  const { messages } = decoder.read();
  const lapMesgs = (messages.lapMesgs ?? []) as FitLap[];
  const recordMesgs = ((messages.recordMesgs ?? []) as FitRecord[]).filter((r) => r.timestamp);

  const laps: Omit<RunLap, "id" | "actual_run_id">[] = lapMesgs.map((lap, i) => ({
    lap_index: i + 1,
    distance_km: round(num(lap.totalDistance) != null ? lap.totalDistance! / 1000 : null, 3),
    duration_min: round(num(lap.totalTimerTime) != null ? lap.totalTimerTime! / 60 : null, 2),
    avg_hr: num(lap.avgHeartRate),
    max_hr: num(lap.maxHeartRate),
    avg_cadence_spm: lapCadenceSpm(lap),
    elevation_gain_m: num(lap.totalAscent),
    elevation_loss_m: num(lap.totalDescent),
    avg_power_w: num(lap.avgPower),
  }));

  let stream: RunStreamPoints | null = null;
  if (recordMesgs.length > 0) {
    const t0 = recordMesgs[0]!.timestamp!.getTime();
    const points = sample(recordMesgs, STREAM_POINTS);
    stream = {
      t: points.map((r) => Math.round((r.timestamp!.getTime() - t0) / 1000)),
      hr: points.map((r) => num(r.heartRate)),
      speed: points.map((r) => round(num(r.enhancedSpeed) ?? num(r.speed), 2)),
      alt: points.map((r) => round(num(r.enhancedAltitude) ?? num(r.altitude), 1)),
      dist: points.map((r) => round(num(r.distance) != null ? r.distance! / 1000 : null, 3)),
    };
    // Power / cadence only when the file has them (rides with a power meter or trainer).
    if (points.some((r) => num(r.power) != null)) stream.power = points.map((r) => num(r.power));
    if (points.some((r) => num(r.cadence) != null)) stream.cad = points.map((r) => num(r.cadence));
  }
  return { laps, stream };
}

// ---------------------------------------------------------------------------
// Mapping to Kova's run record
// ---------------------------------------------------------------------------

const minutes = (seconds: number | null | undefined) =>
  seconds != null && Number.isFinite(seconds) ? Math.round((seconds / 60) * 100) / 100 : null;

/** "2026-11-15 07:01:23" (GMT) → ISO instant. */
function gmtToIso(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = value.includes("T") ? value : value.replace(" ", "T");
  return /Z|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
}

export function garminRunMetrics(a: GarminApiActivity): RunMetrics {
  const zones = [a.hrTimeInZone_1, a.hrTimeInZone_2, a.hrTimeInZone_3, a.hrTimeInZone_4, a.hrTimeInZone_5];
  return {
    activity_name: a.activityName ?? null,
    activity_type: a.activityType?.typeKey ?? null,
    moving_duration_min: minutes(a.movingDuration),
    elapsed_duration_min: minutes(a.elapsedDuration),
    elevation_loss_m: num(a.elevationLoss),
    min_elevation_m: num(a.minElevation),
    max_elevation_m: num(a.maxElevation),
    max_cadence_spm: num(a.maxRunningCadenceInStepsPerMinute),
    avg_speed_mps: num(a.averageSpeed),
    max_speed_mps: num(a.maxSpeed),
    avg_grade_adjusted_speed_mps: num(a.avgGradeAdjustedSpeed),
    avg_power_w: num(a.avgPower),
    max_power_w: num(a.maxPower),
    aerobic_te: num(a.aerobicTrainingEffect),
    anaerobic_te: num(a.anaerobicTrainingEffect),
    te_label: a.trainingEffectLabel ?? null,
    training_load: num(a.activityTrainingLoad),
    vo2max: num(a.vO2MaxValue),
    hr_zone_min: zones.some((z) => num(z) != null) ? zones.map((z) => minutes(z) ?? 0) : null,
    avg_stride_m: num(a.avgStrideLength) != null ? round(a.avgStrideLength! / 100, 2) : null,
    avg_ground_contact_ms: num(a.avgGroundContactTime),
    avg_vertical_oscillation_cm: num(a.avgVerticalOscillation),
    avg_vertical_ratio: num(a.avgVerticalRatio),
    avg_respiration: num(a.avgRespirationRate),
    steps: num(a.steps),
    body_battery_delta: num(a.differenceBodyBattery),
    moderate_intensity_min: num(a.moderateIntensityMinutes),
    vigorous_intensity_min: num(a.vigorousIntensityMinutes),
    fastest_1k_min: minutes(a.fastestSplit_1000),
    fastest_mile_min: minutes(a.fastestSplit_1609),
    fastest_5k_min: minutes(a.fastestSplit_5000),
    fastest_10k_min: minutes(a.fastestSplit_10000),
    is_pr: a.isPR ?? null,
    normalized_power_w: num(a.normPower),
    training_stress_score: num(a.trainingStressScore),
    intensity_factor: num(a.intensityFactor),
    max_cadence_rpm: num(a.maxBikingCadenceInRevPerMinute),
    total_sets: num(a.totalSets),
    total_reps: num(a.totalReps),
  };
}

/** Activity summary (+ parsed .FIT when fetched) → the source-agnostic import record. */
export function toIncomingRun(
  a: GarminApiActivity,
  fit?: ReturnType<typeof parseActivityFit> | null,
): IncomingRun | null {
  const date = a.startTimeLocal?.slice(0, 10);
  const durationMin = minutes(a.duration);
  if (!date || durationMin == null || durationMin <= 0) return null;
  return {
    external_id: `garmin:${a.activityId}`,
    date,
    started_at: gmtToIso(a.startTimeGMT),
    duration_min: durationMin,
    distance_km: num(a.distance) != null ? a.distance! / 1000 : null,
    detail: {
      avg_hr: num(a.averageHR),
      max_hr: num(a.maxHR),
      elevation_gain_m: num(a.elevationGain),
      avg_cadence_spm: num(a.averageRunningCadenceInStepsPerMinute),
      calories: num(a.calories),
      metrics: garminRunMetrics(a),
      ...(fit ? { laps: fit.laps, stream: fit.stream } : {}),
    },
  };
}

/** A ride or strength session → its garmin_activities row (without the trace). */
export function toGarminActivityRow(
  a: GarminApiActivity,
  sport: GarminSport,
): Omit<GarminActivity, "id" | "created_at" | "updated_at" | "stream"> | null {
  const date = a.startTimeLocal?.slice(0, 10);
  const durationMin = minutes(a.duration);
  if (!date || durationMin == null || durationMin <= 0) return null;
  return {
    external_id: `garmin:${a.activityId}`,
    sport,
    activity_type: a.activityType?.typeKey ?? null,
    name: a.activityName ?? null,
    date,
    started_at: gmtToIso(a.startTimeGMT),
    duration_min: durationMin,
    distance_km: num(a.distance) && a.distance! > 0 ? a.distance! / 1000 : null,
    avg_hr: num(a.averageHR),
    max_hr: num(a.maxHR),
    calories: num(a.calories),
    elevation_gain_m: num(a.elevationGain),
    avg_power_w: num(a.avgPower),
    avg_cadence_rpm: num(a.averageBikingCadenceInRevPerMinute),
    training_load: num(a.activityTrainingLoad),
    aerobic_te: num(a.aerobicTrainingEffect),
    anaerobic_te: num(a.anaerobicTrainingEffect),
    metrics: garminRunMetrics(a),
  };
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

const LBS_PER_KG = 2.20462;

type GarminWeight = {
  calendarDate?: string | null;
  date?: string | number | null;
  weight?: number | null;
  bmi?: number | null;
  bodyFat?: number | null;
  bodyWater?: number | null;
  boneMass?: number | null;
  muscleMass?: number | null;
  visceralFat?: number | null;
  metabolicAge?: number | null;
  timestampGMT?: string | number | null;
};

/** Garmin documents kilograms; older payloads used grams. Anything over 1000 is grams. */
function massToKg(value: number | null | undefined): number | null {
  const v = num(value);
  if (v == null || v <= 0) return null;
  return v > 1000 ? v / 1000 : v;
}

const kgToLbs = (kg: number | null) => (kg == null ? null : Math.round(kg * LBS_PER_KG * 10) / 10);

/** Timestamp as ISO — Garmin sends either an ISO-ish string or epoch milliseconds. */
function weighInTime(w: GarminWeight): string | null {
  const raw = w.timestampGMT ?? w.date;
  if (typeof raw === "number") return new Date(raw).toISOString();
  if (typeof raw === "string" && raw.length > 10) {
    const parsed = Date.parse(/Z|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`);
    return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
  }
  return null;
}

export type GarminWeighIn = {
  external_id: string;
  date: string;
  weight_lbs: number;
  body_fat_pct: number | null;
  measured_at: string | null;
  metrics: WeightMetrics | null;
};

/** The latest weigh-in for each day between the two local dates (inclusive). */
export async function listWeighIns(startDate: string, endDate: string): Promise<GarminWeighIn[]> {
  const body = (await (
    await garminFetch(`/weight-service/weight/range/${startDate}/${endDate}`)
  ).json()) as { dailyWeightSummaries?: { summaryDate?: string; latestWeight?: GarminWeight | null }[] };

  const out: GarminWeighIn[] = [];
  for (const day of body.dailyWeightSummaries ?? []) {
    const w = day.latestWeight;
    const date = (day.summaryDate ?? w?.calendarDate ?? "").slice(0, 10);
    const lbs = kgToLbs(massToKg(w?.weight));
    if (!w || !date || lbs == null) continue;
    const measuredAt = weighInTime(w);
    const metrics: WeightMetrics = {
      bmi: num(w.bmi),
      body_water_pct: num(w.bodyWater),
      muscle_mass_lbs: kgToLbs(massToKg(w.muscleMass)),
      bone_mass_lbs: kgToLbs(massToKg(w.boneMass)),
      visceral_fat: num(w.visceralFat),
      metabolic_age: num(w.metabolicAge),
    };
    out.push({
      // Per weigh-in, so deleting one in Kova doesn't block a later weigh-in that day.
      external_id: `garmin-weight:${date}:${measuredAt ?? "latest"}`,
      date,
      weight_lbs: lbs,
      body_fat_pct: num(w.bodyFat),
      measured_at: measuredAt,
      metrics: Object.values(metrics).some((v) => v != null) ? metrics : null,
    });
  }
  return out;
}
