import { cache } from "react";
import { createServiceClient } from "@/lib/supabase/server";
import { getGarminActivitiesBetween, getGarminDailyHistory, matchStrengthSessions } from "@/lib/data/garmin";
import { listHevyWorkoutsBetween } from "@/lib/data/hevy";
import { getInjuries } from "@/lib/data/injuries";
import { getSleepHistory, getTimezone } from "@/lib/data/oura";
import { getUpcomingRace } from "@/lib/data/running";
import type { GarminHrZones } from "@/lib/garmin";
import { injuryName, injuryPenalty, isLowerBody } from "@/lib/injuries";
import {
  dailyLoads,
  fitnessSeries,
  paceZonesFrom5k,
  predictRaces,
  recoveryScore,
  strainLabel,
  strainScore,
  todayAdvice,
  type DayLoad,
  type Effort,
  type FitnessPoint,
  type LoadSession,
  type PaceZone,
  type Recovery,
  type Sport,
  type TodayAdvice,
} from "@/lib/performance";
import { raceTitle } from "@/lib/run-fuel";
import { weekStart } from "@/lib/run-calendar";
import { addDays, todayInTimezone } from "@/lib/utils";
import type { ActualRun, GarminDaily, Injury, InjuryCheckin, RunMetrics } from "@/types";

/** Extra history before the shown window so fitness (42-day) starts from a settled value. */
const SEED_DAYS = 90;
const HARD_RUN_TYPES = new Set(["tempo", "intervals", "race"]);
const HARD_TE = /TEMPO|THRESHOLD|VO2|ANAEROBIC|SPEED/i;

export type RecoveryDay = { date: string; score: number | null; strain: number };

export type PerformanceData = {
  today: string;
  recovery: Recovery;
  strain: { score: number; label: string; load: number };
  advice: TodayAdvice;
  current: FitnessPoint | null;
  /** Shown window, oldest first. */
  fitness: FitnessPoint[];
  recoveryHistory: RecoveryDay[];
  /** Load by sport per week (Monday start), last 8 weeks. */
  weeklyLoad: { week: string; run: number; ride: number; lift: number }[];
  /** Minutes in HR zones 1–5 per week, last 6 weeks (runs + rides + Garmin lifts). */
  weeklyZones: { week: string; zones: number[] }[];
  vo2max: { date: string; value: number }[];
  predictions: ReturnType<typeof predictRaces> & { raceKey: string | null };
  paceZones: PaceZone[] | null;
  hrZones: GarminHrZones | null;
  estimatedDays: number;
};

const mean = (xs: (number | null | undefined)[], min = 1): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length >= min ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Injury penalty on a past date, from the check-in level that applied then. */
function penaltyOn(date: string, injuries: { injury: Injury; checkins: InjuryCheckin[] }[]) {
  const active = injuries.flatMap(({ injury, checkins }) => {
    if (injury.onset_date > date || (injury.resolved_on && injury.resolved_on <= date)) return [];
    const latest = checkins.filter((c) => c.date <= date).at(-1);
    return [{ injury, severity: latest?.severity ?? injury.severity }];
  });
  return injuryPenalty(active);
}

/** Everything the Performance page and Home's Today card need. */
export const getPerformance = cache(async function getPerformance(days = 90): Promise<PerformanceData> {
  const today = todayInTimezone(await getTimezone());
  const start = addDays(today, -(days - 1));
  const seedStart = addDays(start, -SEED_DAYS);
  const db = createServiceClient();

  const [runRes, activities, lifts, garmin, sleep, injuries, race, zonesRes] = await Promise.all([
    db
      .from("actual_runs")
      .select("date, actual_duration_min, actual_distance_km, run_type, metrics")
      .gte("date", seedStart)
      .lte("date", today)
      .order("date"),
    getGarminActivitiesBetween(seedStart, today),
    listHevyWorkoutsBetween(seedStart, today),
    getGarminDailyHistory(days + 21),
    getSleepHistory(days + 21),
    getInjuries(true),
    getUpcomingRace(today),
    db.from("user_settings").select("garmin_hr_zones").limit(1).maybeSingle(),
  ]);
  const runs = (runRes.data as Pick<ActualRun, "date" | "actual_duration_min" | "actual_distance_km" | "run_type" | "metrics">[]) ?? [];
  const strengthByWorkout = matchStrengthSessions(lifts, activities.filter((a) => a.sport === "strength"));

  // --- Load -----------------------------------------------------------------
  const sessions: LoadSession[] = [
    ...runs.map((r) => ({
      date: r.date,
      sport: "run" as Sport,
      duration_min: r.actual_duration_min,
      load: r.metrics?.training_load ?? null,
      hard: HARD_RUN_TYPES.has(r.run_type ?? "") || HARD_TE.test(r.metrics?.te_label ?? ""),
    })),
    ...activities.map((a) => ({
      date: a.date,
      sport: (a.sport === "cycling" ? "ride" : "lift") as Sport,
      duration_min: a.duration_min,
      load: a.training_load,
      hard: HARD_TE.test(a.metrics?.te_label ?? ""),
    })),
    // Hevy lifts the watch didn't record get an estimate.
    ...lifts
      .filter((w) => w.date && !strengthByWorkout[w.id])
      .map((w) => ({ date: w.date!, sport: "lift" as Sport, duration_min: (w.duration ?? 0) / 60, load: null })),
  ];
  const loads: DayLoad[] = dailyLoads(sessions, seedStart, today);
  const series = fitnessSeries(loads);
  const fitness = series.filter((p) => p.date >= start);
  const current = series.at(-1) ?? null;
  const loadByDate = new Map(loads.map((d) => [d.date, d]));

  // --- Recovery (per day, so the chart and today share one formula) ----------
  const garminByDate = new Map(garmin.map((g) => [g.date, g]));
  const sleepByDate = new Map(sleep.map((s) => [s.date, s.score]));
  const formByDate = new Map(series.map((p) => [p.date, p.form]));
  const injuryViews = injuries.map((v) => ({ injury: v.injury, checkins: v.checkins }));

  const recoveryOn = (date: string): Recovery => {
    const g: GarminDaily | undefined = garminByDate.get(date);
    const prior = (n: number) => Array.from({ length: n }, (_, i) => garminByDate.get(addDays(date, -(i + 1))));
    const garminBaseline =
      g?.hrv_baseline_low_ms != null && g.hrv_baseline_high_ms != null
        ? (g.hrv_baseline_low_ms + g.hrv_baseline_high_ms) / 2
        : null;
    return recoveryScore({
      hrv: g?.hrv_last_night_ms ?? null,
      hrvBaseline: garminBaseline ?? mean(prior(14).map((p) => p?.hrv_last_night_ms), 3),
      rhr: g?.resting_hr ?? null,
      rhrBaseline: mean(prior(7).map((p) => p?.resting_hr), 3),
      sleepScore: sleepByDate.get(date) ?? null,
      form: formByDate.get(date) ?? null,
      injury: penaltyOn(date, injuryViews),
    });
  };

  const recoveryHistory: RecoveryDay[] = [];
  for (let d = addDays(today, -29); d <= today; d = addDays(d, 1)) {
    recoveryHistory.push({ date: d, score: recoveryOn(d).score, strain: strainScore(loadByDate.get(d)?.total ?? 0) });
  }
  const recovery = recoveryOn(today);
  const todayLoad = loadByDate.get(today)?.total ?? 0;

  const activeNow = injuries
    .filter((v) => v.injury.status !== "resolved")
    .sort((a, b) => b.severity - a.severity)[0];
  const advice = todayAdvice({
    recovery: recovery.score,
    ratio: current?.ratio ?? null,
    worstInjury: activeNow
      ? { severity: activeNow.severity, lower: isLowerBody(activeNow.injury.body_part), name: injuryName(activeNow.injury) }
      : null,
  });

  // --- Weekly load by sport & time in zones ---------------------------------
  const weeks: string[] = [];
  for (let w = weekStart(addDays(today, -7 * 7)); w <= today; w = addDays(w, 7)) weeks.push(w);
  const weeklyLoad = weeks.map((week) => {
    const out = { week, run: 0, ride: 0, lift: 0 };
    for (let i = 0; i < 7; i++) {
      const d = loadByDate.get(addDays(week, i));
      if (d) {
        out.run += d.run;
        out.ride += d.ride;
        out.lift += d.lift;
      }
    }
    return out;
  });
  const zoneSources: { date: string; metrics: RunMetrics | null }[] = [
    ...runs.map((r) => ({ date: r.date, metrics: r.metrics })),
    ...activities.map((a) => ({ date: a.date, metrics: a.metrics })),
  ];
  const weeklyZones = weeks.slice(-6).map((week) => {
    const zones = [0, 0, 0, 0, 0];
    for (const s of zoneSources) {
      if (s.date < week || s.date > addDays(week, 6)) continue;
      (s.metrics?.hr_zone_min ?? []).forEach((m, i) => {
        if (i < 5) zones[i]! += m ?? 0;
      });
    }
    return { week, zones: zones.map((z) => Math.round(z)) };
  });

  // --- Fitness estimates ------------------------------------------------------
  const vo2max = [...runs, ...activities]
    .map((r) => ({ date: r.date, value: r.metrics?.vo2max ?? null }))
    .filter((v): v is { date: string; value: number } => v.value != null)
    .sort((a, b) => a.date.localeCompare(b.date));

  const efforts: Effort[] = runs.flatMap((r) => {
    const out: Effort[] = [];
    if (r.actual_distance_km && r.actual_distance_km > 0) {
      out.push({ date: r.date, distance_km: r.actual_distance_km, time_min: r.actual_duration_min, label: "run" });
    }
    if (r.metrics?.fastest_5k_min) out.push({ date: r.date, distance_km: 5, time_min: r.metrics.fastest_5k_min, label: "fastest 5K split" });
    if (r.metrics?.fastest_10k_min) out.push({ date: r.date, distance_km: 10, time_min: r.metrics.fastest_10k_min, label: "fastest 10K split" });
    return out;
  });
  const raceExtra =
    race?.distance_km != null
      ? [{ key: "race", label: raceTitle({ race_name: race.name, event_type: race.event_type }, race.distance_km), km: race.distance_km }]
      : [];
  const predictions = { ...predictRaces(efforts, today, raceExtra), raceKey: raceExtra.length ? "race" : null };
  const fiveK = predictions.predictions.find((p) => p.key === "5k");

  return {
    today,
    recovery,
    strain: { score: strainScore(todayLoad), label: strainLabel(strainScore(todayLoad)), load: todayLoad },
    advice,
    current,
    fitness,
    recoveryHistory,
    weeklyLoad,
    weeklyZones,
    vo2max,
    predictions,
    paceZones: fiveK ? paceZonesFrom5k(fiveK.minutes) : null,
    hrZones: ((zonesRes.data as { garmin_hr_zones?: GarminHrZones | null } | null)?.garmin_hr_zones ?? null),
    estimatedDays: fitness.filter((p) => loadByDate.get(p.date)?.estimated).length,
  };
});
