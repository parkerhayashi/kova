import { after } from "next/server";
import { PageHeader } from "@/components/PageHeader";
import { TrainingApp } from "@/components/training/TrainingApp";
import {
  getGarminActivitiesBetween,
  getGarminActivityStreams,
  matchStrengthSessions,
  syncGarminIfStale,
} from "@/lib/data/garmin";
import { listHevyWorkoutsBetween } from "@/lib/data/hevy";
import { getDailyTotals, getNutritionGoals } from "@/lib/data/nutrition";
import { getTimezone } from "@/lib/data/oura";
import {
  getFuelProducts,
  getRecentEasyPace,
  getRunExtras,
  getRunFuelCarbsPerHour,
  getRunningRange,
  getTrainingPlan,
} from "@/lib/data/running";
import { buildActivityEntries, monthGridRange } from "@/lib/run-calendar";
import { normalizeIsoDate, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** One calendar for runs (plan, fuel, races), lifts (Hevy + Garmin) and rides (Garmin). */
export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { date: dateParam, view: viewParam } = await searchParams;
  after(syncGarminIfStale);
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const selected = normalizeIsoDate(dateParam) ?? today;
  const view = viewParam === "week" ? "week" : "month";
  const { start, end } = monthGridRange(selected);

  // Range first: it sweeps stale plans so the day's targets read clean.
  const range = await getRunningRange(start, end);
  const [goals, totals, pace, rate, plan, fuelProducts, runExtras, workouts, garmin] =
    await Promise.all([
      getNutritionGoals(selected),
      selected <= today ? getDailyTotals(selected) : Promise.resolve({}),
      getRecentEasyPace(),
      getRunFuelCarbsPerHour(),
      getTrainingPlan(5),
      getFuelProducts(),
      getRunExtras(range.actual.filter((a) => a.date === selected).map((a) => a.id)),
      listHevyWorkoutsBetween(start, end),
      getGarminActivitiesBetween(start, end),
    ]);

  const rides = garmin.filter((a) => a.sport === "cycling");
  const strengthByWorkout = matchStrengthSessions(
    workouts,
    garmin.filter((a) => a.sport === "strength"),
  );
  const dayRides = rides.filter((r) => r.date === selected);
  const rideStreams = await getGarminActivityStreams(dayRides.map((r) => r.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training"
        subtitle="Runs, lifts and rides on one calendar, with run fuel and race carb loads."
      />
      <TrainingApp
        key={selected}
        today={today}
        selected={selected}
        view={view}
        range={{
          ...range,
          entries: [...range.entries, ...buildActivityEntries({ lifts: workouts, rides })],
        }}
        goals={goals}
        totals={totals}
        pace={pace}
        carbsPerHour={rate}
        plan={plan}
        fuelProducts={fuelProducts}
        runExtras={runExtras}
        lifts={workouts
          .filter((w) => w.date === selected)
          .map((workout) => ({ workout, garmin: strengthByWorkout[workout.id] ?? null }))}
        rides={dayRides}
        rideStreams={rideStreams}
      />
    </div>
  );
}
