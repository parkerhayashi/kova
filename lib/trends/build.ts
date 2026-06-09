import { addDays, shortDate } from "@/lib/utils";
import { scatterFromPairs } from "@/lib/trends/correlation";
import type {
  CorrelationView,
  DualTrendView,
  TrendsInput,
  TrendsPayload,
  TrendRange,
} from "@/lib/trends/types";
import type { Activity, Readiness, Sleep } from "@/types";

function indexByDate<T extends { date: string }>(rows: T[]): Map<string, T> {
  return new Map(rows.map((r) => [r.date, r]));
}

function workoutVolumeByDay(
  workouts: TrendsInput["workouts"],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const w of workouts) {
    if (!w.day) continue;
    const vol = (w.calories ?? 0) + (map.get(w.day) ?? 0);
    map.set(w.day, vol);
  }
  return map;
}

function habitRateByDay(
  logs: TrendsInput["habitLogs"],
  habitCount: number,
): Map<string, number> {
  if (habitCount === 0) return new Map();
  const done = new Map<string, number>();
  for (const log of logs) {
    if (!log.completed) continue;
    done.set(log.date, (done.get(log.date) ?? 0) + 1);
  }
  const rates = new Map<string, number>();
  for (const [date, count] of done) {
    rates.set(date, Math.round((count / habitCount) * 100));
  }
  return rates;
}

function supplementRateByDay(
  logs: TrendsInput["supplementLogs"],
  supplementCount: number,
): Map<string, number> {
  if (supplementCount === 0) return new Map();
  const taken = new Map<string, number>();
  for (const log of logs) {
    if (!log.taken) continue;
    taken.set(log.date, (taken.get(log.date) ?? 0) + 1);
  }
  const rates = new Map<string, number>();
  for (const [date, count] of taken) {
    rates.set(date, Math.round((count / supplementCount) * 100));
  }
  return rates;
}

function buildCorrelation(
  base: Omit<CorrelationView, "points" | "r">,
  pairs: { label: string; x: number; y: number }[],
): CorrelationView {
  const { points, r } = scatterFromPairs(pairs);
  return { ...base, points, r };
}

/** Sleep score on day D vs readiness on D+1 (morning after that sleep). */
function sleepVsNextReadiness(
  sleep: Sleep[],
  readiness: Readiness[],
): CorrelationView {
  const readinessByDate = indexByDate(readiness);
  const pairs: { label: string; x: number; y: number }[] = [];

  for (const s of sleep) {
    if (s.score == null) continue;
    const next = readinessByDate.get(addDays(s.date, 1));
    if (next?.score == null) continue;
    pairs.push({
      label: shortDate(s.date),
      x: s.score,
      y: next.score,
    });
  }

  return buildCorrelation(
    {
      id: "sleep-readiness",
      title: "Sleep → Next-Day Readiness",
      subtitle: "Sleep score vs. readiness the following morning",
      xLabel: "Sleep score",
      yLabel: "Readiness",
      xAccent: "sleep",
      yAccent: "recovery",
      minPairs: 3,
    },
    pairs,
  );
}

/** Stress vs HRV on the same day. */
function stressVsHrv(
  activity: Activity[],
  readiness: Readiness[],
): CorrelationView {
  const readinessByDate = indexByDate(readiness);
  const pairs: { label: string; x: number; y: number }[] = [];

  for (const a of activity) {
    if (a.stress_score == null) continue;
    const r = readinessByDate.get(a.date);
    if (r?.hrv_balance == null) continue;
    pairs.push({
      label: shortDate(a.date),
      x: a.stress_score,
      y: r.hrv_balance,
    });
  }

  return buildCorrelation(
    {
      id: "stress-hrv",
      title: "Stress vs. HRV",
      subtitle: "Daily stress score vs. heart-rate variability balance",
      xLabel: "Stress",
      yLabel: "HRV balance",
      xAccent: "stress",
      yAccent: "recovery",
      minPairs: 3,
    },
    pairs,
  );
}

/** Prior-night sleep vs same-day activity score. */
function sleepVsActivity(
  sleep: Sleep[],
  activity: Activity[],
): CorrelationView {
  const activityByDate = indexByDate(activity);
  const pairs: { label: string; x: number; y: number }[] = [];

  for (const s of sleep) {
    if (s.score == null) continue;
    const a = activityByDate.get(s.date);
    if (a?.activity_score == null) continue;
    pairs.push({
      label: shortDate(s.date),
      x: s.score,
      y: a.activity_score,
    });
  }

  return buildCorrelation(
    {
      id: "sleep-activity",
      title: "Sleep vs. Activity",
      subtitle: "Sleep quality vs. same-day activity score",
      xLabel: "Sleep score",
      yLabel: "Activity score",
      xAccent: "sleep",
      yAccent: "activity",
      minPairs: 3,
    },
    pairs,
  );
}

/** Training volume (Oura workout calories) vs HRV. */
function trainingVsHrv(
  workouts: TrendsInput["workouts"],
  readiness: Readiness[],
): CorrelationView {
  const volumeByDay = workoutVolumeByDay(workouts);
  const readinessByDate = indexByDate(readiness);
  const pairs: { label: string; x: number; y: number }[] = [];

  for (const [date, volume] of volumeByDay) {
    if (volume <= 0) continue;
    const r = readinessByDate.get(date);
    if (r?.hrv_balance == null) continue;
    pairs.push({
      label: shortDate(date),
      x: volume,
      y: r.hrv_balance,
    });
  }

  return buildCorrelation(
    {
      id: "training-hrv",
      title: "Training Volume vs. HRV",
      subtitle: "Oura workout calories vs. HRV balance",
      xLabel: "Workout cal",
      yLabel: "HRV balance",
      xAccent: "activity",
      yAccent: "recovery",
      minPairs: 3,
    },
    pairs,
  );
}

function rateVsReadiness(
  id: string,
  title: string,
  subtitle: string,
  xLabel: string,
  rates: Map<string, number>,
  readiness: Readiness[],
  xAccent: "activity" | "nutrition",
): CorrelationView {
  const readinessByDate = indexByDate(readiness);
  const pairs: { label: string; x: number; y: number }[] = [];

  for (const [date, rate] of rates) {
    const r = readinessByDate.get(date);
    if (r?.score == null) continue;
    pairs.push({ label: shortDate(date), x: rate, y: r.score });
  }

  return buildCorrelation(
    {
      id,
      title,
      subtitle,
      xLabel,
      yLabel: "Readiness",
      xAccent,
      yAccent: "recovery",
      minPairs: 3,
    },
    pairs,
  );
}

/** Active calories vs body weight over time. */
function caloriesVsWeight(
  activity: Activity[],
  weight: TrendsInput["weight"],
): DualTrendView {
  const weightByDate = new Map(weight.map((w) => [w.date, w.weight_lbs]));
  const dates = [
    ...new Set([
      ...activity.map((a) => a.date),
      ...weight.map((w) => w.date),
    ]),
  ].sort();

  const labels: string[] = [];
  const calories: (number | null)[] = [];
  const weights: (number | null)[] = [];

  for (const date of dates) {
    labels.push(shortDate(date));
    const a = activity.find((row) => row.date === date);
    calories.push(a?.active_calories ?? null);
    weights.push(weightByDate.get(date) ?? null);
  }

  return {
    id: "calories-weight",
    title: "Calories vs. Weight",
    subtitle: "Active calorie burn overlaid with body weight trend",
    labels,
    primary: calories,
    secondary: weights,
    primaryLabel: "Active cal",
    secondaryLabel: "Weight (lb)",
    primaryAccent: "activity",
    secondaryAccent: "nutrition",
  };
}

export function buildTrendsPayload(
  input: TrendsInput,
  range: TrendRange,
  ouraConnected: boolean,
): TrendsPayload {
  const habitRates = habitRateByDay(input.habitLogs, input.habitCount);
  const supplementRates = supplementRateByDay(
    input.supplementLogs,
    input.supplementCount,
  );

  return {
    range,
    ouraConnected,
    correlations: [
      sleepVsNextReadiness(input.sleep, input.readiness),
      stressVsHrv(input.activity, input.readiness),
      sleepVsActivity(input.sleep, input.activity),
      trainingVsHrv(input.workouts, input.readiness),
      rateVsReadiness(
        "habits-readiness",
        "Habits vs. Readiness",
        "Daily habit completion rate vs. readiness score",
        "Habits %",
        habitRates,
        input.readiness,
        "activity",
      ),
      rateVsReadiness(
        "supplements-readiness",
        "Supplements vs. Readiness",
        "Supplement stack adherence vs. readiness score",
        "Stack %",
        supplementRates,
        input.readiness,
        "nutrition",
      ),
    ],
    dualTrends: [caloriesVsWeight(input.activity, input.weight)],
    comingSoon: [
      {
        title: "Run pace vs. prior-night sleep",
        reason: "Connect Strava to compare run pace with sleep scores.",
      },
      {
        title: "Protein intake vs. strength volume",
        reason: "Nutrition logging (Phase 6) and Hevy import unlock this view.",
      },
    ],
  };
}
