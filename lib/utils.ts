/** Tiny className combiner — no dependency needed for this app's scale. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/**
 * Fallback display timezone. The user's real zone is auto-detected from the
 * browser and stored in user_settings; this is only used before that lands.
 */
export const DEFAULT_TIMEZONE = "America/New_York";

/** Map a Kova semantic accent name to its CSS color token. */
export type Accent =
  | "recovery"
  | "sleep"
  | "activity"
  | "stress"
  | "nutrition";

export const accentColor: Record<Accent, string> = {
  recovery: "var(--color-recovery)",
  sleep: "var(--color-sleep)",
  activity: "var(--color-activity)",
  stress: "var(--color-stress)",
  nutrition: "var(--color-nutrition)",
};

/** Format a duration in seconds as "7h 32m" (or "—" when missing). */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Decimal hours (e.g. 7.5) from seconds, rounded to one place. */
export function secondsToHours(seconds: number | null | undefined): number | null {
  if (seconds === null || seconds === undefined) return null;
  return Math.round((seconds / 3600) * 10) / 10;
}

/** Today's calendar date (YYYY-MM-DD) in the given zone — for daily logging. */
export function todayInTimezone(timeZone: string = DEFAULT_TIMEZONE): string {
  // en-CA renders as YYYY-MM-DD, so the parts are already in ISO order.
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
}

/** ISO date (YYYY-MM-DD) `n` days before `iso` (n may be negative). */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** Whole days between two ISO dates (a − b), ignoring time of day. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd);
  return Math.round(ms / 86_400_000);
}

/**
 * Current daily streak ending at `today`. Counts consecutive days present in
 * `done`, starting from today (or yesterday if today isn't logged yet, so an
 * unchecked current day doesn't prematurely break the streak).
 */
export function currentStreak(done: Set<string>, today: string): number {
  let cursor = done.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (done.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Consecutive days without an occurrence (for track / day-tag items). */
export function clearStreak(
  occurred: Set<string>,
  today: string,
  since?: string,
): number {
  if (occurred.has(today)) return 0;
  let cursor = today;
  let streak = 0;
  while (!occurred.has(cursor)) {
    if (since && cursor < since) break;
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Format a past timestamp for sync status (e.g. "2:34 PM · 45 min ago"). */
export function formatSyncStatus(
  iso: string | null,
  timeZone: string = DEFAULT_TIMEZONE,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const clock = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });

  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(diffSec);
  let relative: string;
  if (abs < 60) relative = rtf.format(diffSec, "second");
  else if (abs < 3600) relative = rtf.format(Math.round(diffSec / 60), "minute");
  else if (abs < 86_400) relative = rtf.format(Math.round(diffSec / 3600), "hour");
  else relative = rtf.format(Math.round(diffSec / 86_400), "day");

  return `${clock} · ${relative}`;
}

/** Short chart-axis label "Jun 8" from an ISO date string. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Most recent non-null value for a key, scanning a date-ascending list from the
 * newest end. Lets the dashboard show the latest *available* reading rather
 * than a half-processed current-day stub.
 */
export function latestNonNull<T, K extends keyof T>(
  rows: T[],
  key: K,
): T[K] | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];
    if (v !== null && v !== undefined) return v;
  }
  return null;
}

/** Most recent row whose `key` is populated (date-ascending list). */
export function latestRowWith<T, K extends keyof T>(
  rows: T[],
  key: K,
): T | null {
  for (let i = rows.length - 1; i >= 0; i--) {
    const v = rows[i][key];
    if (v !== null && v !== undefined) return rows[i];
  }
  return null;
}

/**
 * Expand an Oura intraday sample (interval + start timestamp + items) into
 * chart points labelled by clock time. Optionally thins to roughly `maxPoints`
 * so dense all-day series stay light to render.
 */
export function expandSample(
  sample: { interval: number; timestamp: string; items: (number | null)[] } | null,
  timeZone: string = DEFAULT_TIMEZONE,
  maxPoints = 240,
): { label: string; value: number | null }[] {
  if (!sample || !sample.items?.length) return [];
  const start = new Date(sample.timestamp).getTime();
  const step = Math.max(1, Math.ceil(sample.items.length / maxPoints));
  const points: { label: string; value: number | null }[] = [];
  for (let i = 0; i < sample.items.length; i += step) {
    const t = new Date(start + i * sample.interval * 1000);
    points.push({
      label: t.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      }),
      value: sample.items[i],
    });
  }
  return points;
}

/** Build chart points from stored all-day heart-rate samples. */
export function heartRateSeries(
  samples: { t: string; bpm: number }[] | null,
  timeZone: string = DEFAULT_TIMEZONE,
  maxPoints = 240,
): { label: string; value: number | null }[] {
  if (!samples?.length) return [];
  const step = Math.max(1, Math.ceil(samples.length / maxPoints));
  const points: { label: string; value: number | null }[] = [];
  for (let i = 0; i < samples.length; i += step) {
    const s = samples[i];
    points.push({
      label: new Date(s.t).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      }),
      value: s.bpm,
    });
  }
  return points;
}

/** Format an ISO datetime as a clock time in the given zone, e.g. "11:42 PM". */
export function clockTime(
  iso: string | null | undefined,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/** Format an offset-from-midnight (seconds) as a clock time, e.g. "10:30 PM". */
export function offsetToClock(offsetSeconds: number | null | undefined): string {
  if (offsetSeconds === null || offsetSeconds === undefined) return "—";
  const mins = Math.round((offsetSeconds % 86400) / 60);
  const h = Math.floor(((mins / 60) % 24 + 24) % 24);
  const m = ((mins % 60) + 60) % 60;
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Trailing simple moving average over a numeric series (nulls skipped). */
export function rollingAverage(
  values: (number | null)[],
  window: number,
): (number | null)[] {
  return values.map((_, i) => {
    const slice = values
      .slice(Math.max(0, i - window + 1), i + 1)
      .filter((v): v is number => v !== null);
    if (slice.length === 0) return null;
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    return Math.round(avg * 10) / 10;
  });
}
