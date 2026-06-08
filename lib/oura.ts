/**
 * Oura API v2 integration (blueprint §2, Table 2).
 * OAuth 2.0 — Personal Access Tokens were deprecated December 2025.
 * All credentials live in server-side env vars; never expose to the browser.
 */
import type {
  ActivityContributors,
  HeartRateSample,
  OuraSample,
  ReadinessContributors,
  ResilienceContributors,
  SleepContributors,
} from "@/types";

const OURA_BASE = "https://api.ouraring.com/v2/usercollection";
const OURA_AUTH = "https://cloud.ouraring.com/oauth/authorize";
const OURA_TOKEN = "https://api.ouraring.com/oauth/token";

export const OURA_SCOPES = [
  "daily",
  "heartrate",
  "workout",
  "tag", // tags / enhanced tags
  "personal",
  "session",
  "spo2",
  "heart_health", // VO2 max, cardiovascular age
  "stress", // daily stress + resilience
] as const;

/** Build the consent URL to start the OAuth flow. */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.OURA_CLIENT_ID!,
    redirect_uri: process.env.OURA_REDIRECT_URI!,
    response_type: "code",
    scope: OURA_SCOPES.join(" "),
    state,
  });
  return `${OURA_AUTH}?${params}`;
}

interface OuraTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/** Exchange an authorization code (or refresh token) for access tokens. */
export async function exchangeToken(
  params:
    | { grant_type: "authorization_code"; code: string }
    | { grant_type: "refresh_token"; refresh_token: string },
): Promise<OuraTokens> {
  const body = new URLSearchParams({
    client_id: process.env.OURA_CLIENT_ID!,
    client_secret: process.env.OURA_CLIENT_SECRET!,
    redirect_uri: process.env.OURA_REDIRECT_URI!,
    ...params,
  });

  const res = await fetch(OURA_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Oura token exchange failed: ${res.status}`);
  return res.json();
}

/** Fetch a date-ranged Oura collection endpoint. */
export async function ouraFetch<T = unknown>(
  endpoint: string,
  accessToken: string,
  range: { start_date: string; end_date: string },
): Promise<{ data: T[] }> {
  const params = new URLSearchParams(range);
  const res = await fetch(`${OURA_BASE}/${endpoint}?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Oura ${endpoint} failed: ${res.status}`);
  return res.json();
}

/**
 * Fetch the all-day heartrate time-series. Unlike the date-range collections,
 * this endpoint takes `start_datetime`/`end_datetime` and paginates via
 * `next_token`. Returns the flat sample list across all pages.
 */
export async function ouraFetchHeartRate(
  accessToken: string,
  range: { start_datetime: string; end_datetime: string },
): Promise<RawHeartRate[]> {
  const all: RawHeartRate[] = [];
  let nextToken: string | null = null;
  do {
    const url = new URL(`${OURA_BASE}/heartrate`);
    url.searchParams.set("start_datetime", range.start_datetime);
    url.searchParams.set("end_datetime", range.end_datetime);
    if (nextToken) url.searchParams.set("next_token", nextToken);
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Oura heartrate failed: ${res.status}`);
    const json = (await res.json()) as {
      data: RawHeartRate[];
      next_token: string | null;
    };
    all.push(...(json.data ?? []));
    nextToken = json.next_token ?? null;
  } while (nextToken);
  return all;
}

/** Fetch a single-object endpoint (personal_info). */
async function ouraFetchObject<T>(
  endpoint: string,
  accessToken: string,
): Promise<T> {
  const res = await fetch(`${OURA_BASE}/${endpoint}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Oura ${endpoint} failed: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Raw Oura V2 response shapes. Field names verified against the Oura V2
// OpenAPI spec.
// ---------------------------------------------------------------------------
interface RawDailySleep {
  day: string;
  score: number | null;
  contributors: SleepContributors | null;
}

interface RawSleepPeriod {
  id: string;
  day: string;
  type: string; // "long_sleep" is the main nightly session
  bedtime_start: string | null;
  bedtime_end: string | null;
  total_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  light_sleep_duration: number | null;
  awake_time: number | null;
  time_in_bed: number | null;
  efficiency: number | null;
  latency: number | null;
  average_heart_rate: number | null;
  lowest_heart_rate: number | null; // bpm
  average_hrv: number | null; // ms
  average_breath: number | null;
  restless_periods: number | null;
  sleep_phase_5_min: string | null;
  movement_30_sec: string | null;
  heart_rate: OuraSample | null;
  hrv: OuraSample | null;
}

interface RawDailyReadiness {
  day: string;
  score: number | null;
  temperature_deviation: number | null; // °C
  temperature_trend_deviation: number | null;
  contributors: ReadinessContributors | null;
}

interface RawDailyActivity {
  day: string;
  score: number | null;
  steps: number | null;
  active_calories: number | null;
  total_calories: number | null;
  equivalent_walking_distance: number | null;
  high_activity_time: number | null;
  medium_activity_time: number | null;
  low_activity_time: number | null;
  sedentary_time: number | null;
  resting_time: number | null;
  non_wear_time: number | null;
  high_activity_met_minutes: number | null;
  medium_activity_met_minutes: number | null;
  low_activity_met_minutes: number | null;
  sedentary_met_minutes: number | null;
  average_met_minutes: number | null;
  target_calories: number | null;
  target_meters: number | null;
  meters_to_target: number | null;
  inactivity_alerts: number | null;
  class_5_min: string | null;
  contributors: ActivityContributors | null;
}

interface RawDailyStress {
  day: string;
  stress_high: number | null; // seconds
  recovery_high: number | null; // seconds
  day_summary: string | null; // restored | normal | stressful
}

interface RawDailySpo2 {
  day: string;
  spo2_percentage: { average: number | null } | null;
  breathing_disturbance_index: number | null;
}

interface RawVo2Max {
  day: string;
  vo2_max: number | null;
}

interface RawCardiovascularAge {
  day: string;
  vascular_age: number | null;
}

interface RawSleepTime {
  day: string;
  optimal_bedtime: { start_offset: number; end_offset: number } | null;
  recommendation: string | null;
  status: string | null;
}

interface RawWorkout {
  id: string;
  day: string;
  activity: string;
  calories: number | null;
  distance: number | null;
  intensity: string | null;
  label: string | null;
  source: string | null;
  start_datetime: string;
  end_datetime: string;
}

interface RawSession {
  id: string;
  day: string;
  type: string | null;
  start_datetime: string;
  end_datetime: string;
  mood: string | null;
  heart_rate: OuraSample | null;
  heart_rate_variability: OuraSample | null;
  motion_count: OuraSample | null;
}

interface RawEnhancedTag {
  id: string;
  tag_type_code: string | null;
  start_time: string;
  end_time: string | null;
  start_day: string;
  end_day: string | null;
  comment: string | null;
  custom_name: string | null;
}

interface RawRingConfig {
  id: string;
  color: string | null;
  design: string | null;
  firmware_version: string | null;
  hardware_type: string | null;
  set_up_at: string | null;
  size: number | null;
}

interface RawPersonalInfo {
  id: string;
  age: number | null;
  weight: number | null;
  height: number | null;
  biological_sex: string | null;
  email: string | null;
}

interface RawHeartRate {
  bpm: number;
  source: string;
  timestamp: string;
}

type ResilienceLevel =
  | "limited"
  | "adequate"
  | "solid"
  | "strong"
  | "exceptional";

interface RawDailyResilience {
  day: string;
  level: ResilienceLevel | null;
  contributors: ResilienceContributors | null;
}

const RESILIENCE_LEVELS: ResilienceLevel[] = [
  "limited",
  "adequate",
  "solid",
  "strong",
  "exceptional",
];

/** Map Oura's qualitative resilience level to a 1–5 ordinal for storage. */
export function resilienceToOrdinal(level: ResilienceLevel | null): number | null {
  if (!level) return null;
  const idx = RESILIENCE_LEVELS.indexOf(level);
  return idx === -1 ? null : idx + 1;
}

/** Inverse of {@link resilienceToOrdinal} — for display. */
export function ordinalToResilience(ordinal: number | null): string | null {
  if (!ordinal) return null;
  const label = RESILIENCE_LEVELS[ordinal - 1];
  return label ? label[0].toUpperCase() + label.slice(1) : null;
}

// ---------------------------------------------------------------------------
// Normalized row shapes — mirror the Supabase tables minus generated columns.
// These are what the sync route upserts. (sleep_debt_seconds is computed by
// the sync route from history, not by Oura.)
// ---------------------------------------------------------------------------
export interface OuraSleepRow {
  date: string;
  score: number | null;
  total_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  light_sleep_duration: number | null;
  awake_duration: number | null;
  efficiency: number | null;
  latency: number | null;
  restfulness: number | null;
  average_heart_rate: number | null;
  average_breath: number | null;
  lowest_heart_rate: number | null;
  restless_periods: number | null;
  time_in_bed: number | null;
  bedtime_start: string | null;
  bedtime_end: string | null;
  sleep_phase_5min: string | null;
  movement_30sec: string | null;
  contributors: SleepContributors | null;
  optimal_bedtime_start: number | null;
  optimal_bedtime_end: number | null;
  bedtime_recommendation: string | null;
  bedtime_status: string | null;
}

export interface OuraReadinessRow {
  date: string;
  score: number | null;
  hrv_balance: number | null; // nightly average HRV in ms (see blueprint note)
  body_temperature: number | null; // deviation in °C
  recovery_index: number | null;
  resting_heart_rate: number | null; // bpm
  cardiovascular_age: number | null;
  resilience_score: number | null; // 1–5 ordinal
  temperature_trend_deviation: number | null;
  contributors: ReadinessContributors | null;
  resilience_contributors: ResilienceContributors | null;
}

export interface OuraActivityRow {
  date: string;
  steps: number | null;
  active_calories: number | null;
  total_calories: number | null;
  activity_score: number | null;
  stress_score: number | null; // high-stress minutes
  spo2_avg: number | null;
  vo2_max: number | null;
  equivalent_walking_distance: number | null;
  high_activity_time: number | null;
  medium_activity_time: number | null;
  low_activity_time: number | null;
  sedentary_time: number | null;
  resting_time: number | null;
  non_wear_time: number | null;
  high_activity_met_minutes: number | null;
  medium_activity_met_minutes: number | null;
  low_activity_met_minutes: number | null;
  sedentary_met_minutes: number | null;
  average_met_minutes: number | null;
  target_calories: number | null;
  target_meters: number | null;
  meters_to_target: number | null;
  inactivity_alerts: number | null;
  class_5min: string | null;
  breathing_disturbance_index: number | null;
  recovery_high: number | null;
  stress_summary: string | null;
  contributors: ActivityContributors | null;
}

export interface OuraSleepPeriodRow {
  oura_id: string;
  date: string | null;
  type: string | null;
  bedtime_start: string | null;
  bedtime_end: string | null;
  total_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  light_sleep_duration: number | null;
  awake_time: number | null;
  time_in_bed: number | null;
  efficiency: number | null;
  latency: number | null;
  average_heart_rate: number | null;
  lowest_heart_rate: number | null;
  average_hrv: number | null;
  average_breath: number | null;
  restless_periods: number | null;
  sleep_phase_5min: string | null;
  movement_30sec: string | null;
  heart_rate: OuraSample | null;
  hrv: OuraSample | null;
}

export interface OuraWorkoutRow {
  oura_id: string;
  day: string | null;
  activity: string | null;
  calories: number | null;
  distance: number | null;
  intensity: string | null;
  label: string | null;
  source: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
}

export interface OuraSessionRow {
  oura_id: string;
  day: string | null;
  type: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  mood: string | null;
  heart_rate: OuraSample | null;
  heart_rate_variability: OuraSample | null;
  motion_count: OuraSample | null;
}

export interface OuraTagRow {
  oura_id: string;
  start_day: string | null;
  end_day: string | null;
  start_time: string | null;
  end_time: string | null;
  tag_type_code: string | null;
  custom_name: string | null;
  comment: string | null;
}

export interface OuraProfileRow {
  age: number | null;
  height: number | null;
  weight: number | null;
  biological_sex: string | null;
  email: string | null;
  ring_color: string | null;
  ring_design: string | null;
  ring_firmware_version: string | null;
  ring_hardware_type: string | null;
  ring_size: number | null;
  ring_set_up_at: string | null;
}

export interface HeartRateDailyRow {
  date: string;
  samples: HeartRateSample[];
}

export interface NormalizedOura {
  sleep: OuraSleepRow[];
  readiness: OuraReadinessRow[];
  activity: OuraActivityRow[];
  sleepPeriods: OuraSleepPeriodRow[];
  workouts: OuraWorkoutRow[];
  sessions: OuraSessionRow[];
  tags: OuraTagRow[];
  profile: OuraProfileRow | null;
}

/** Pick the main (long_sleep) period per day, falling back to the longest. */
function mainSleepByDay(periods: RawSleepPeriod[]): Map<string, RawSleepPeriod> {
  const byDay = new Map<string, RawSleepPeriod>();
  for (const p of periods) {
    const current = byDay.get(p.day);
    if (!current) {
      byDay.set(p.day, p);
      continue;
    }
    const better =
      (p.type === "long_sleep" && current.type !== "long_sleep") ||
      (p.total_sleep_duration ?? 0) > (current.total_sleep_duration ?? 0);
    if (better) byDay.set(p.day, p);
  }
  return byDay;
}

function indexByDay<T extends { day: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.day, r]));
}

/**
 * Group all-day heart-rate samples into one bucket per local day. Stored as a
 * single JSON row per day to keep table size bounded.
 */
export function groupHeartRateByDay(samples: RawHeartRate[]): HeartRateDailyRow[] {
  const byDay = new Map<string, HeartRateSample[]>();
  for (const s of samples) {
    if (s.bpm == null || !s.timestamp) continue;
    const day = s.timestamp.slice(0, 10);
    const bucket = byDay.get(day) ?? [];
    bucket.push({ t: s.timestamp, bpm: s.bpm, source: s.source });
    if (bucket.length === 1) byDay.set(day, bucket);
  }
  return [...byDay.entries()].map(([date, samplesForDay]) => ({
    date,
    samples: samplesForDay,
  }));
}

/**
 * Fetch every date-ranged Oura collection plus the profile/ring config, and
 * normalize into rows for each table. Each endpoint is fetched independently:
 * a single source failing (e.g. a 404 for a metric the ring doesn't produce)
 * leaves its fields null rather than sinking the whole sync. A total failure
 * (e.g. a bad token) still throws so the caller can surface it.
 */
export async function fetchOuraData(
  accessToken: string,
  range: { start_date: string; end_date: string },
): Promise<NormalizedOura> {
  const failures: string[] = [];
  let succeeded = 0;
  const safeGet = async <T>(endpoint: string): Promise<{ data: T[] }> => {
    try {
      const res = await ouraFetch<T>(endpoint, accessToken, range);
      succeeded++;
      return res;
    } catch (err) {
      failures.push(`${endpoint}: ${(err as Error).message}`);
      return { data: [] };
    }
  };
  const safeObject = async <T>(endpoint: string): Promise<T | null> => {
    try {
      const res = await ouraFetchObject<T>(endpoint, accessToken);
      succeeded++;
      return res;
    } catch (err) {
      failures.push(`${endpoint}: ${(err as Error).message}`);
      return null;
    }
  };

  const [
    dailySleep,
    sleepPeriods,
    readiness,
    activity,
    stress,
    spo2,
    vo2,
    cardio,
    resilience,
    sleepTime,
    workouts,
    sessions,
    tags,
    ringConfig,
    personalInfo,
  ] = await Promise.all([
    safeGet<RawDailySleep>("daily_sleep"),
    safeGet<RawSleepPeriod>("sleep"),
    safeGet<RawDailyReadiness>("daily_readiness"),
    safeGet<RawDailyActivity>("daily_activity"),
    safeGet<RawDailyStress>("daily_stress"),
    safeGet<RawDailySpo2>("daily_spo2"),
    safeGet<RawVo2Max>("vO2_max"),
    safeGet<RawCardiovascularAge>("daily_cardiovascular_age"),
    safeGet<RawDailyResilience>("daily_resilience"),
    safeGet<RawSleepTime>("sleep_time"),
    safeGet<RawWorkout>("workout"),
    safeGet<RawSession>("session"),
    safeGet<RawEnhancedTag>("enhanced_tag"),
    safeGet<RawRingConfig>("ring_configuration"),
    safeObject<RawPersonalInfo>("personal_info"),
  ]);

  if (succeeded === 0) {
    throw new Error(`All Oura endpoints failed — ${failures.join("; ")}`);
  }
  if (failures.length > 0) {
    console.warn(`Oura sync skipped unavailable endpoints — ${failures.join("; ")}`);
  }

  const mainSleep = mainSleepByDay(sleepPeriods.data);
  const dailySleepByDay = indexByDay(dailySleep.data);
  const stressByDay = indexByDay(stress.data);
  const spo2ByDay = indexByDay(spo2.data);
  const vo2ByDay = indexByDay(vo2.data);
  const cardioByDay = indexByDay(cardio.data);
  const resilienceByDay = indexByDay(resilience.data);
  const sleepTimeByDay = indexByDay(sleepTime.data);

  // Sleep rows are keyed off whichever days have a sleep session or a score.
  const sleepDays = new Set<string>([
    ...mainSleep.keys(),
    ...dailySleepByDay.keys(),
  ]);
  const sleep: OuraSleepRow[] = [...sleepDays].map((day) => {
    const period = mainSleep.get(day);
    const ds = dailySleepByDay.get(day);
    const st = sleepTimeByDay.get(day);
    return {
      date: day,
      score: ds?.score ?? null,
      total_sleep_duration: period?.total_sleep_duration ?? null,
      rem_sleep_duration: period?.rem_sleep_duration ?? null,
      deep_sleep_duration: period?.deep_sleep_duration ?? null,
      light_sleep_duration: period?.light_sleep_duration ?? null,
      awake_duration: period?.awake_time ?? null,
      efficiency: period?.efficiency ?? null,
      latency: period?.latency ?? null,
      restfulness: ds?.contributors?.restfulness ?? null,
      average_heart_rate: period?.average_heart_rate ?? null,
      average_breath: period?.average_breath ?? null,
      lowest_heart_rate: period?.lowest_heart_rate ?? null,
      restless_periods: period?.restless_periods ?? null,
      time_in_bed: period?.time_in_bed ?? null,
      bedtime_start: period?.bedtime_start ?? null,
      bedtime_end: period?.bedtime_end ?? null,
      sleep_phase_5min: period?.sleep_phase_5_min ?? null,
      movement_30sec: period?.movement_30_sec ?? null,
      contributors: ds?.contributors ?? null,
      optimal_bedtime_start: st?.optimal_bedtime?.start_offset ?? null,
      optimal_bedtime_end: st?.optimal_bedtime?.end_offset ?? null,
      bedtime_recommendation: st?.recommendation ?? null,
      bedtime_status: st?.status ?? null,
    };
  });

  const readinessRows: OuraReadinessRow[] = readiness.data.map((r) => {
    const period = mainSleep.get(r.day);
    return {
      date: r.day,
      score: r.score ?? null,
      hrv_balance: period?.average_hrv ?? null,
      body_temperature: r.temperature_deviation ?? null,
      recovery_index: r.contributors?.recovery_index ?? null,
      resting_heart_rate: period?.lowest_heart_rate ?? null,
      cardiovascular_age: cardioByDay.get(r.day)?.vascular_age ?? null,
      resilience_score: resilienceToOrdinal(
        resilienceByDay.get(r.day)?.level ?? null,
      ),
      temperature_trend_deviation: r.temperature_trend_deviation ?? null,
      contributors: r.contributors ?? null,
      resilience_contributors: resilienceByDay.get(r.day)?.contributors ?? null,
    };
  });

  const activityRows: OuraActivityRow[] = activity.data.map((a) => {
    const stressRow = stressByDay.get(a.day);
    const stressHigh = stressRow?.stress_high ?? null;
    const spo2Row = spo2ByDay.get(a.day);
    return {
      date: a.day,
      steps: a.steps ?? null,
      active_calories: a.active_calories ?? null,
      total_calories: a.total_calories ?? null,
      activity_score: a.score ?? null,
      stress_score: stressHigh === null ? null : Math.round(stressHigh / 60),
      spo2_avg: spo2Row?.spo2_percentage?.average ?? null,
      vo2_max: vo2ByDay.get(a.day)?.vo2_max ?? null,
      equivalent_walking_distance: a.equivalent_walking_distance ?? null,
      high_activity_time: a.high_activity_time ?? null,
      medium_activity_time: a.medium_activity_time ?? null,
      low_activity_time: a.low_activity_time ?? null,
      sedentary_time: a.sedentary_time ?? null,
      resting_time: a.resting_time ?? null,
      non_wear_time: a.non_wear_time ?? null,
      high_activity_met_minutes: a.high_activity_met_minutes ?? null,
      medium_activity_met_minutes: a.medium_activity_met_minutes ?? null,
      low_activity_met_minutes: a.low_activity_met_minutes ?? null,
      sedentary_met_minutes: a.sedentary_met_minutes ?? null,
      average_met_minutes: a.average_met_minutes ?? null,
      target_calories: a.target_calories ?? null,
      target_meters: a.target_meters ?? null,
      meters_to_target: a.meters_to_target ?? null,
      inactivity_alerts: a.inactivity_alerts ?? null,
      class_5min: a.class_5_min ?? null,
      breathing_disturbance_index: spo2Row?.breathing_disturbance_index ?? null,
      recovery_high: stressRow?.recovery_high ?? null,
      stress_summary: stressRow?.day_summary ?? null,
      contributors: a.contributors ?? null,
    };
  });

  const sleepPeriodRows: OuraSleepPeriodRow[] = sleepPeriods.data.map((p) => ({
    oura_id: p.id,
    date: p.day ?? null,
    type: p.type ?? null,
    bedtime_start: p.bedtime_start ?? null,
    bedtime_end: p.bedtime_end ?? null,
    total_sleep_duration: p.total_sleep_duration ?? null,
    rem_sleep_duration: p.rem_sleep_duration ?? null,
    deep_sleep_duration: p.deep_sleep_duration ?? null,
    light_sleep_duration: p.light_sleep_duration ?? null,
    awake_time: p.awake_time ?? null,
    time_in_bed: p.time_in_bed ?? null,
    efficiency: p.efficiency ?? null,
    latency: p.latency ?? null,
    average_heart_rate: p.average_heart_rate ?? null,
    lowest_heart_rate: p.lowest_heart_rate ?? null,
    average_hrv: p.average_hrv ?? null,
    average_breath: p.average_breath ?? null,
    restless_periods: p.restless_periods ?? null,
    sleep_phase_5min: p.sleep_phase_5_min ?? null,
    movement_30sec: p.movement_30_sec ?? null,
    heart_rate: p.heart_rate ?? null,
    hrv: p.hrv ?? null,
  }));

  const workoutRows: OuraWorkoutRow[] = workouts.data.map((w) => ({
    oura_id: w.id,
    day: w.day ?? null,
    activity: w.activity ?? null,
    calories: w.calories ?? null,
    distance: w.distance ?? null,
    intensity: w.intensity ?? null,
    label: w.label ?? null,
    source: w.source ?? null,
    start_datetime: w.start_datetime ?? null,
    end_datetime: w.end_datetime ?? null,
  }));

  const sessionRows: OuraSessionRow[] = sessions.data.map((s) => ({
    oura_id: s.id,
    day: s.day ?? null,
    type: s.type ?? null,
    start_datetime: s.start_datetime ?? null,
    end_datetime: s.end_datetime ?? null,
    mood: s.mood ?? null,
    heart_rate: s.heart_rate ?? null,
    heart_rate_variability: s.heart_rate_variability ?? null,
    motion_count: s.motion_count ?? null,
  }));

  const tagRows: OuraTagRow[] = tags.data.map((t) => ({
    oura_id: t.id,
    start_day: t.start_day ?? null,
    end_day: t.end_day ?? null,
    start_time: t.start_time ?? null,
    end_time: t.end_time ?? null,
    tag_type_code: t.tag_type_code ?? null,
    custom_name: t.custom_name ?? null,
    comment: t.comment ?? null,
  }));

  const ring = ringConfig.data.at(-1) ?? null; // most recent configuration
  const profile: OuraProfileRow | null =
    personalInfo || ring
      ? {
          age: personalInfo?.age ?? null,
          height: personalInfo?.height ?? null,
          weight: personalInfo?.weight ?? null,
          biological_sex: personalInfo?.biological_sex ?? null,
          email: personalInfo?.email ?? null,
          ring_color: ring?.color ?? null,
          ring_design: ring?.design ?? null,
          ring_firmware_version: ring?.firmware_version ?? null,
          ring_hardware_type: ring?.hardware_type ?? null,
          ring_size: ring?.size ?? null,
          ring_set_up_at: ring?.set_up_at ?? null,
        }
      : null;

  return {
    sleep,
    readiness: readinessRows,
    activity: activityRows,
    sleepPeriods: sleepPeriodRows,
    workouts: workoutRows,
    sessions: sessionRows,
    tags: tagRows,
    profile,
  };
}

/**
 * Native sleep-debt calculation (blueprint §2 — Oura's pre-computed value is
 * not exposed, so Kova derives it). Sleep debt for a night is the trailing
 * 14-day sum of (sleep need − actual sleep), floored at zero so surplus sleep
 * pays down debt but can't drive it negative.
 *
 * Returns a map of date → debt in seconds. Nights missing sleep data
 * contribute no deficit.
 */
export function computeSleepDebt(
  nights: { date: string; total_sleep_duration: number | null }[],
  sleepNeedHours: number,
  windowDays = 14,
): Map<string, number> {
  const needSeconds = sleepNeedHours * 3600;
  const sorted = [...nights].sort((a, b) => a.date.localeCompare(b.date));
  const debt = new Map<string, number>();

  for (let i = 0; i < sorted.length; i++) {
    let sum = 0;
    for (let j = Math.max(0, i - windowDays + 1); j <= i; j++) {
      const actual = sorted[j].total_sleep_duration;
      if (actual === null) continue;
      sum += needSeconds - actual;
    }
    debt.set(sorted[i].date, Math.max(0, Math.round(sum)));
  }
  return debt;
}
