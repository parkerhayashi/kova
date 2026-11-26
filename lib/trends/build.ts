import { addDays, shortDate } from "@/lib/utils";
import { scatterFromPairs } from "@/lib/trends/correlation";
import {
  buildNutritionCaloriesVsWeight,
  buildNutritionProteinVsWeight,
} from "@/lib/trends/nutrition-weight";
import type {
  CorrelationView,
  DualTrendView,
  TrendsInput,
  TrendsPayload,
  TrendRange,
} from "@/lib/trends/types";
import { buildRunningTrends } from "@/lib/trends/running";
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

/** Drinks on day D vs a metric on D+1 (days with no log count as 0). */
function drinksVsNextDay(
  id: string,
  title: string,
  subtitle: string,
  xLabel: string,
  drinksByDay: Map<string, number>,
  rows: { date: string; value: number | null }[],
  yLabel: string,
  yAccent: CorrelationView["yAccent"],
): CorrelationView {
  const pairs: { label: string; x: number; y: number }[] = [];

  for (const row of rows) {
    if (row.value == null) continue;
    const drinkDate = addDays(row.date, -1);
    pairs.push({
      label: shortDate(drinkDate),
      x: drinksByDay.get(drinkDate) ?? 0,
      y: row.value,
    });
  }

  return buildCorrelation(
    {
      id,
      title,
      subtitle,
      xLabel,
      yLabel,
      xAccent: "stress",
      yAccent,
      minPairs: 3,
    },
    pairs,
  );
}

function alcoholCorrelations(
  drinksByDay: Map<string, number>,
  sleep: Sleep[],
  readiness: Readiness[],
  liftingVolumeByDay: TrendsInput["liftingVolumeByDay"],
): CorrelationView[] {
  const xLabel = "Drinks (est.)";

  return [
    drinksVsNextDay(
      "alcohol-readiness",
      `Alcohol → Next-Day Body Battery`,
      `Evening drinks logged vs. Body Battery the following morning`,
      xLabel,
      drinksByDay,
      readiness.map((r) => ({ date: r.date, value: r.score })),
      "Body Battery",
      "recovery",
    ),
    drinksVsNextDay(
      "alcohol-sleep",
      `Alcohol → Next-Night Sleep`,
      `Drinks logged vs. sleep score the following night`,
      xLabel,
      drinksByDay,
      sleep.map((s) => ({ date: s.date, value: s.score })),
      "Sleep score",
      "sleep",
    ),
    drinksVsNextDay(
      "alcohol-hrv",
      `Alcohol → Next-Day HRV`,
      `Drinks logged vs. overnight HRV the following morning`,
      xLabel,
      drinksByDay,
      readiness.map((r) => ({ date: r.date, value: r.hrv_balance })),
      "HRV (ms)",
      "recovery",
    ),
    drinksVsNextDay(
      "alcohol-lifting",
      `Alcohol → Next-Day Lifting`,
      `Drinks logged vs. lifting volume the following day`,
      xLabel,
      drinksByDay,
      liftingVolumeRows(liftingVolumeByDay),
      "Volume (lb)",
      "activity",
    ),
  ];
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
      title: "Sleep → Next-Day Body Battery",
      subtitle: "Sleep score vs. Body Battery the following morning",
      xLabel: "Sleep score",
      yLabel: "Body Battery",
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
      yLabel: "HRV (ms)",
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
    if (a?.steps == null) continue;
    pairs.push({
      label: shortDate(s.date),
      x: s.score,
      y: a.steps,
    });
  }

  return buildCorrelation(
    {
      id: "sleep-activity",
      title: "Sleep vs. Steps",
      subtitle: "Sleep quality vs. same-day activity score",
      xLabel: "Sleep score",
      yLabel: "Steps",
      xAccent: "sleep",
      yAccent: "activity",
      minPairs: 3,
    },
    pairs,
  );
}

function liftingVolumeRows(
  liftingVolumeByDay: TrendsInput["liftingVolumeByDay"],
): { date: string; value: number }[] {
  return [...liftingVolumeByDay.entries()]
    .filter(([, volume]) => volume > 0)
    .map(([date, value]) => ({ date, value }));
}

/** Protein intake vs same-day lifting volume. */
function proteinVsLifting(
  proteinByDay: TrendsInput["proteinByDay"],
  liftingVolumeByDay: TrendsInput["liftingVolumeByDay"],
): CorrelationView {
  const pairs: { label: string; x: number; y: number }[] = [];

  for (const [date, protein] of proteinByDay) {
    const volume = liftingVolumeByDay.get(date);
    if (volume == null || volume <= 0) continue;
    pairs.push({
      label: shortDate(date),
      x: protein,
      y: volume,
    });
  }

  return buildCorrelation(
    {
      id: "protein-lifting",
      title: "Protein vs. Lifting Volume",
      subtitle: "Daily protein intake vs. training volume on the same day",
      xLabel: "Protein (g)",
      yLabel: "Volume (lb)",
      xAccent: "nutrition",
      yAccent: "activity",
      minPairs: 5,
    },
    pairs,
  );
}

/** Readiness vs same-day lifting volume. */
function readinessVsLifting(
  readiness: Readiness[],
  liftingVolumeByDay: TrendsInput["liftingVolumeByDay"],
): CorrelationView {
  const readinessByDate = indexByDate(readiness);
  const pairs: { label: string; x: number; y: number }[] = [];

  for (const [date, volume] of liftingVolumeByDay) {
    if (volume <= 0) continue;
    const r = readinessByDate.get(date);
    if (r?.score == null) continue;
    pairs.push({
      label: shortDate(date),
      x: r.score,
      y: volume,
    });
  }

  return buildCorrelation(
    {
      id: "readiness-lifting",
      title: "Body Battery vs. Training Volume",
      subtitle: "Morning Body Battery vs. lifting volume the same day",
      xLabel: "Body Battery",
      yLabel: "Volume (lb)",
      xAccent: "recovery",
      yAccent: "activity",
      minPairs: 5,
    },
    pairs,
  );
}

/** Prior-night sleep vs next-day lifting volume. */
function sleepVsNextLifting(
  sleep: Sleep[],
  liftingVolumeByDay: TrendsInput["liftingVolumeByDay"],
): CorrelationView {
  const sleepByDate = indexByDate(sleep);
  const pairs: { label: string; x: number; y: number }[] = [];

  for (const [date, volume] of liftingVolumeByDay) {
    if (volume <= 0) continue;
    const sleepDate = addDays(date, -1);
    const s = sleepByDate.get(sleepDate);
    if (s?.score == null) continue;
    pairs.push({
      label: shortDate(sleepDate),
      x: s.score,
      y: volume,
    });
  }

  return buildCorrelation(
    {
      id: "sleep-lifting",
      title: "Sleep → Next-Day Lifting",
      subtitle: "Sleep score vs. lifting volume the following day",
      xLabel: "Sleep score",
      yLabel: "Volume (lb)",
      xAccent: "sleep",
      yAccent: "activity",
      minPairs: 5,
    },
    pairs,
  );
}

/** Hevy training volume (lb) vs HRV. */
function trainingVsHrv(
  liftingVolumeByDay: TrendsInput["liftingVolumeByDay"],
  readiness: Readiness[],
): CorrelationView {
  const readinessByDate = indexByDate(readiness);
  const pairs: { label: string; x: number; y: number }[] = [];

  for (const [date, volume] of liftingVolumeByDay) {
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
      subtitle: "Hevy lifting volume vs. overnight HRV",
      xLabel: "Volume (lb)",
      yLabel: "HRV (ms)",
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
      yLabel: "Body Battery",
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
    title: "Active Calories vs. Weight",
    subtitle: "Oura active calorie burn overlaid with body weight trend",
    labels,
    primary: calories,
    secondary: weights,
    primaryLabel: "Active cal",
    secondaryLabel: "Weight (lb)",
    primaryAccent: "activity",
    secondaryAccent: "nutrition",
  };
}

/** Recovery / Strain correlations and trend (Kova's Performance scores). */
function performanceViews(input: TrendsInput): { correlations: CorrelationView[]; trend: DualTrendView | null } {
  const perf = (input.performance ?? []).filter((p) => p.date <= input.today);
  if (!perf.length) return { correlations: [], trend: null };
  const recovery = new Map(perf.filter((p) => p.recovery != null).map((p) => [p.date, p.recovery!]));
  const sleepScore = new Map(input.sleep.filter((s) => s.score != null).map((s) => [s.date, s.score!]));
  const nextDay = (xs: Map<string, number>) =>
    [...xs]
      .map(([d, x]) => ({ d, x, y: recovery.get(addDays(d, 1)) }))
      .filter((p): p is { d: string; x: number; y: number } => p.y != null)
      .map((p) => ({ label: shortDate(p.d), x: Math.round(p.x * 10) / 10, y: p.y }));
  const strain = new Map(perf.filter((p) => p.strain > 0).map((p) => [p.date, p.strain]));
  const sameDay = [...sleepScore]
    .map(([d, x]) => ({ d, x, y: recovery.get(d) }))
    .filter((p): p is { d: string; x: number; y: number } => p.y != null)
    .map((p) => ({ label: shortDate(p.d), x: p.x, y: p.y }));
  return {
    correlations: [
      buildCorrelation(
        { id: "strain-next-recovery", title: "Strain vs. next-day Recovery", subtitle: "How hard days land the next morning", xLabel: "Strain", yLabel: "Recovery", xAccent: "activity", yAccent: "recovery", minPairs: 5 },
        nextDay(strain),
      ),
      buildCorrelation(
        { id: "sleep-recovery", title: "Sleep score vs. Recovery", subtitle: "Last night's sleep vs. this morning's Recovery", xLabel: "Sleep score", yLabel: "Recovery", xAccent: "sleep", yAccent: "recovery", minPairs: 5 },
        sameDay,
      ),
      buildCorrelation(
        { id: "calories-next-recovery", title: "Calories vs. next-day Recovery", subtitle: "Food in vs. how recovered you wake up", xLabel: "Calories", yLabel: "Recovery", xAccent: "nutrition", yAccent: "recovery", minPairs: 5 },
        nextDay(input.caloriesByDay),
      ),
    ],
    trend: {
      id: "recovery-strain",
      title: "Recovery vs. Strain",
      subtitle: "Kova's daily Recovery score with each day's Strain",
      labels: perf.map((p) => shortDate(p.date)),
      primary: perf.map((p) => p.strain),
      secondary: perf.map((p) => p.recovery),
      primaryLabel: "Strain",
      secondaryLabel: "Recovery",
      primaryAccent: "activity",
      secondaryAccent: "recovery",
      primaryAsBars: true,
    },
  };
}

export function buildTrendsPayload(
  input: TrendsInput,
  range: TrendRange,
  wearableConnected: boolean,
): TrendsPayload {
  const supplementRates = supplementRateByDay(
    input.supplementLogs,
    input.supplementCount,
  );
  const perfViews = performanceViews(input);

  return {
    range,
    wearableConnected,
    running: buildRunningTrends({
      runs: input.runs,
      readiness: input.readiness,
      sleep: input.sleep,
      range,
      today: input.today,
    }),
    correlations: [
      ...perfViews.correlations,
      sleepVsNextReadiness(input.sleep, input.readiness),
      stressVsHrv(input.activity, input.readiness),
      sleepVsActivity(input.sleep, input.activity),
      trainingVsHrv(input.liftingVolumeByDay, input.readiness),
      proteinVsLifting(input.proteinByDay, input.liftingVolumeByDay),
      readinessVsLifting(input.readiness, input.liftingVolumeByDay),
      sleepVsNextLifting(input.sleep, input.liftingVolumeByDay),
      rateVsReadiness(
        "supplements-readiness",
        "Supplements vs. Body Battery",
        "Supplement stack adherence vs. morning Body Battery",
        "Stack %",
        supplementRates,
        input.readiness,
        "nutrition",
      ),
      ...alcoholCorrelations(
        input.alcoholDrinksByDay,
        input.sleep,
        input.readiness,
        input.liftingVolumeByDay,
      ),
    ],
    dualTrends: [
      ...(perfViews.trend ? [perfViews.trend] : []),
      buildNutritionCaloriesVsWeight(input.caloriesByDay, input.weight),
      buildNutritionProteinVsWeight(input.proteinByDay, input.weight),
      caloriesVsWeight(input.activity, input.weight),
    ],
    comingSoon: [],
  };
}
