import { kmToMiles } from "@/lib/run-fuel";
import { weekStart } from "@/lib/run-calendar";
import { scatterFromPairs } from "@/lib/trends/correlation";
import { addDays, shortDate } from "@/lib/utils";
import type {
  CorrelationView,
  DualTrendView,
  RunningTrends,
  TrendRange,
} from "@/lib/trends/types";
import type { ActualRun, Readiness, Sleep } from "@/types";

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Miles and minutes per day (several runs on one day are summed). */
function runsByDay(runs: ActualRun[]): Map<string, { miles: number; minutes: number }> {
  const map = new Map<string, { miles: number; minutes: number }>();
  for (const run of runs) {
    const row = map.get(run.date) ?? { miles: 0, minutes: 0 };
    row.miles += run.actual_distance_km != null ? kmToMiles(run.actual_distance_km) : 0;
    row.minutes += run.actual_duration_min;
    map.set(run.date, row);
  }
  return map;
}

/** Minutes per mile, only for runs with a distance. */
function paceMinPerMile(run: ActualRun): number | null {
  if (run.actual_distance_km == null || run.actual_distance_km <= 0) return null;
  return run.actual_duration_min / kmToMiles(run.actual_distance_km);
}

/** "9:32 /mi" */
export function formatPace(minPerMile: number | null): string {
  if (minPerMile == null) return "—";
  const total = Math.round(minPerMile * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} /mi`;
}

/**
 * Mileage per bin vs average readiness in that bin. Weekly bins (Monday start)
 * for 30/90 days; daily for 7, where a week is a single point.
 */
function mileageVsReadiness(
  runs: ActualRun[],
  readiness: Readiness[],
  range: TrendRange,
  today: string,
): DualTrendView {
  const weekly = range !== 7;
  const bin = (date: string) => (weekly ? weekStart(date) : date);
  const start = addDays(today, -(range - 1));

  const bins: string[] = [];
  for (let d = bin(start); d <= today; d = addDays(d, weekly ? 7 : 1)) bins.push(d);

  const miles = new Map<string, number>();
  for (const run of runs) {
    if (run.actual_distance_km == null) continue;
    const key = bin(run.date);
    miles.set(key, (miles.get(key) ?? 0) + kmToMiles(run.actual_distance_km));
  }
  const scores = new Map<string, number[]>();
  for (const r of readiness) {
    if (r.score == null) continue;
    const key = bin(r.date);
    scores.set(key, [...(scores.get(key) ?? []), r.score]);
  }

  return {
    id: "running-mileage-readiness",
    title: weekly ? "Weekly Mileage vs. Body Battery" : "Daily Mileage vs. Body Battery",
    subtitle: weekly
      ? "Miles run each week (Mon–Sun) vs. that week's average morning Body Battery"
      : "Miles run each day vs. that morning's Body Battery",
    labels: bins.map((d) => (weekly ? `Wk ${shortDate(d)}` : shortDate(d))),
    primary: bins.map((d) => round1(miles.get(d) ?? 0)),
    secondary: bins.map((d) => {
      const list = scores.get(d);
      return list?.length ? Math.round(list.reduce((a, b) => a + b, 0) / list.length) : null;
    }),
    primaryLabel: "Miles",
    secondaryLabel: "Body Battery",
    primaryAccent: "activity",
    secondaryAccent: "recovery",
    primaryAsBars: true,
    emptyHint: "Log or import runs to see your mileage.",
  };
}

/** Pace and distance of each run, oldest first. */
function paceAndDistance(runs: ActualRun[]): DualTrendView {
  const withPace = runs
    .filter((r) => paceMinPerMile(r) != null)
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  return {
    id: "running-pace-distance",
    title: "Pace & Distance",
    subtitle: "Average pace (min/mi, lower is faster) and distance of each run",
    labels: withPace.map((r) => shortDate(r.date)),
    primary: withPace.map((r) => Math.round((paceMinPerMile(r) ?? 0) * 100) / 100),
    secondary: withPace.map((r) => round1(kmToMiles(r.actual_distance_km ?? 0))),
    primaryLabel: "Pace (min/mi)",
    secondaryLabel: "Miles",
    primaryAccent: "activity",
    secondaryAccent: "sleep",
    emptyHint: "Runs with a distance show pace here.",
  };
}

/**
 * Pace and average heart rate per run (Garmin runs). Faster pace at the same
 * or lower heart rate over weeks is aerobic fitness improving.
 */
function paceAndHeartRate(runs: ActualRun[]): DualTrendView {
  const withHr = runs
    .filter((r) => r.avg_hr != null && paceMinPerMile(r) != null)
    .sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? -1 : 1));
  return {
    id: "running-pace-hr",
    title: "Pace & Heart Rate",
    subtitle:
      "Each run's pace (min/mi) and average heart rate. Faster pace at the same heart rate means fitter",
    labels: withHr.map((r) => shortDate(r.date)),
    primary: withHr.map((r) => Math.round((paceMinPerMile(r) ?? 0) * 100) / 100),
    secondary: withHr.map((r) => Math.round(r.avg_hr ?? 0)),
    primaryLabel: "Pace (min/mi)",
    secondaryLabel: "Avg HR",
    primaryAccent: "activity",
    secondaryAccent: "stress",
    emptyHint: "Garmin runs with heart rate show up here.",
  };
}

/** Miles on day D vs readiness the next morning (run days only). */
function runVsNextReadiness(
  byDay: ReturnType<typeof runsByDay>,
  readiness: Readiness[],
): CorrelationView {
  const readinessByDate = new Map(readiness.map((r) => [r.date, r.score]));
  const pairs: { label: string; x: number; y: number }[] = [];
  for (const [date, { miles }] of byDay) {
    if (miles <= 0) continue;
    const next = readinessByDate.get(addDays(date, 1));
    if (next == null) continue;
    pairs.push({ label: shortDate(date), x: round1(miles), y: next });
  }
  const { points, r } = scatterFromPairs(pairs);
  return {
    id: "running-next-readiness",
    title: "Run → Next-Day Body Battery",
    subtitle: "Miles run vs. Body Battery the following morning",
    xLabel: "Miles",
    yLabel: "Body Battery",
    xAccent: "activity",
    yAccent: "recovery",
    minPairs: 4,
    points,
    r,
  };
}

/**
 * Last night's sleep vs that day's pace. Oura dates a night by the morning
 * you wake up, so the sleep row on the run's date is the night before.
 */
function sleepVsPace(runs: ActualRun[], sleep: Sleep[]): CorrelationView {
  const sleepByDate = new Map(sleep.map((s) => [s.date, s.score]));
  const pairs: { label: string; x: number; y: number }[] = [];
  for (const run of runs) {
    const pace = paceMinPerMile(run);
    const score = sleepByDate.get(run.date);
    if (pace == null || score == null) continue;
    pairs.push({ label: shortDate(run.date), x: score, y: Math.round(pace * 100) / 100 });
  }
  const { points, r } = scatterFromPairs(pairs);
  return {
    id: "running-sleep-pace",
    title: "Sleep → Run Pace",
    subtitle: "Last night's sleep score vs. that day's pace (min/mi, lower is faster)",
    xLabel: "Sleep score",
    yLabel: "Pace (min/mi)",
    xAccent: "sleep",
    yAccent: "activity",
    minPairs: 4,
    points,
    r,
  };
}

export function buildRunningTrends(input: {
  runs: ActualRun[];
  readiness: Readiness[];
  sleep: Sleep[];
  range: TrendRange;
  today: string;
}): RunningTrends {
  const start = addDays(input.today, -(input.range - 1));
  const runs = input.runs.filter((r) => r.date >= start && r.date <= input.today);
  const byDay = runsByDay(runs);

  const totalMiles = [...byDay.values()].reduce((sum, d) => sum + d.miles, 0);
  const paced = runs.filter((r) => paceMinPerMile(r) != null);
  const pacedMiles = paced.reduce((sum, r) => sum + kmToMiles(r.actual_distance_km ?? 0), 0);
  const pacedMinutes = paced.reduce((sum, r) => sum + r.actual_duration_min, 0);
  const longest = runs.reduce<ActualRun | null>(
    (best, r) =>
      (r.actual_distance_km ?? 0) > (best?.actual_distance_km ?? 0) ? r : best,
    null,
  );

  return {
    summary: {
      runs: runs.length,
      miles: round1(totalMiles),
      avg_pace_min_per_mile: pacedMiles > 0 ? pacedMinutes / pacedMiles : null,
      longest_miles:
        longest?.actual_distance_km != null ? round1(kmToMiles(longest.actual_distance_km)) : null,
      longest_date: longest?.date ?? null,
      avg_hr: (() => {
        const hr = runs.filter((r) => r.avg_hr != null);
        return hr.length ? Math.round(hr.reduce((s, r) => s + r.avg_hr!, 0) / hr.length) : null;
      })(),
    },
    trends: [
      mileageVsReadiness(runs, input.readiness, input.range, input.today),
      paceAndDistance(runs),
      paceAndHeartRate(runs),
    ],
    correlations: [
      runVsNextReadiness(byDay, input.readiness),
      sleepVsPace(runs, input.sleep),
    ],
  };
}
