/** Tiny className combiner — no dependency needed for this app's scale. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

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
