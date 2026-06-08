/**
 * Oura API v2 integration (blueprint §2, Table 2).
 * OAuth 2.0 — Personal Access Tokens were deprecated December 2025.
 * All credentials live in server-side env vars; never expose to the browser.
 */

const OURA_BASE = "https://api.ouraring.com/v2/usercollection";
const OURA_AUTH = "https://cloud.ouraring.com/oauth/authorize";
const OURA_TOKEN = "https://api.ouraring.com/oauth/token";

export const OURA_SCOPES = [
  "daily",
  "heartrate",
  "workout",
  "personal",
  "session",
  "spo2",
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

// ---------------------------------------------------------------------------
// Raw Oura V2 response shapes (only the fields Kova consumes; see blueprint
// Table 2). Field names verified against the Oura V2 API.
// ---------------------------------------------------------------------------
interface RawDailySleep {
  day: string;
  score: number | null;
  contributors: { restfulness: number | null } | null;
}

interface RawSleepPeriod {
  day: string;
  type: string; // "long_sleep" is the main nightly session
  total_sleep_duration: number | null;
  rem_sleep_duration: number | null;
  deep_sleep_duration: number | null;
  light_sleep_duration: number | null;
  awake_time: number | null;
  efficiency: number | null;
  latency: number | null;
  average_hrv: number | null; // ms
  lowest_heart_rate: number | null; // bpm
}

interface RawDailyReadiness {
  day: string;
  score: number | null;
  temperature_deviation: number | null; // °C
  contributors: { recovery_index: number | null } | null;
}

interface RawDailyActivity {
  day: string;
  score: number | null;
  steps: number | null;
  active_calories: number | null;
  total_calories: number | null;
}

interface RawDailyStress {
  day: string;
  stress_high: number | null; // seconds
}

interface RawDailySpo2 {
  day: string;
  spo2_percentage: { average: number | null } | null;
}

interface RawVo2Max {
  day: string;
  vo2_max: number | null;
}

interface RawCardiovascularAge {
  day: string;
  vascular_age: number | null;
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
}

export interface NormalizedOura {
  sleep: OuraSleepRow[];
  readiness: OuraReadinessRow[];
  activity: OuraActivityRow[];
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
 * Fetch every Oura endpoint Kova uses for a date range and normalize the
 * responses into per-day rows for the sleep / readiness / activity tables.
 * Endpoints are fetched in parallel; an individual failure rejects the batch.
 */
export async function fetchOuraData(
  accessToken: string,
  range: { start_date: string; end_date: string },
): Promise<NormalizedOura> {
  const get = <T>(endpoint: string) =>
    ouraFetch<T>(endpoint, accessToken, range);

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
  ] = await Promise.all([
    get<RawDailySleep>("daily_sleep"),
    get<RawSleepPeriod>("sleep"),
    get<RawDailyReadiness>("daily_readiness"),
    get<RawDailyActivity>("daily_activity"),
    get<RawDailyStress>("daily_stress"),
    get<RawDailySpo2>("daily_spo2"),
    get<RawVo2Max>("vo2_max"),
    get<RawCardiovascularAge>("daily_cardiovascular_age"),
    get<RawDailyResilience>("daily_resilience"),
  ]);

  const mainSleep = mainSleepByDay(sleepPeriods.data);
  const dailySleepByDay = indexByDay(dailySleep.data);
  const stressByDay = indexByDay(stress.data);
  const spo2ByDay = indexByDay(spo2.data);
  const vo2ByDay = indexByDay(vo2.data);
  const cardioByDay = indexByDay(cardio.data);
  const resilienceByDay = indexByDay(resilience.data);

  // Sleep rows are keyed off whichever days have a sleep session or a score.
  const sleepDays = new Set<string>([
    ...mainSleep.keys(),
    ...dailySleepByDay.keys(),
  ]);
  const sleep: OuraSleepRow[] = [...sleepDays].map((day) => {
    const period = mainSleep.get(day);
    const ds = dailySleepByDay.get(day);
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
    };
  });

  const activityRows: OuraActivityRow[] = activity.data.map((a) => {
    const stressHigh = stressByDay.get(a.day)?.stress_high ?? null;
    return {
      date: a.day,
      steps: a.steps ?? null,
      active_calories: a.active_calories ?? null,
      total_calories: a.total_calories ?? null,
      activity_score: a.score ?? null,
      stress_score: stressHigh === null ? null : Math.round(stressHigh / 60),
      spo2_avg: spo2ByDay.get(a.day)?.spo2_percentage?.average ?? null,
      vo2_max: vo2ByDay.get(a.day)?.vo2_max ?? null,
    };
  });

  return { sleep, readiness: readinessRows, activity: activityRows };
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
