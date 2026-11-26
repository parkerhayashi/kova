import { after } from "next/server";
import { PageHeader } from "@/components/PageHeader";
import { PlanCard, PlanSetup } from "@/components/training/PlanCard";
import { TrainingApp } from "@/components/training/TrainingApp";
import {
  countRunWalkQueue,
  getActivePlan,
  getPendingSuggestions,
  reconcilePlan,
  refreshRuleSuggestions,
} from "@/lib/data/plan";
import {
  getGarminActivitiesBetween,
  getGarminActivityStreams,
  matchStrengthSessions,
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
  getUpcomingRace,
} from "@/lib/data/running";
import { buildActivityEntries, buildPlanEntries, monthGridRange } from "@/lib/run-calendar";
import { runWeeklyReviewIfDue } from "@/lib/plan-review";
import { raceTitle } from "@/lib/run-fuel";
import { normalizeIsoDate, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** One calendar for runs (plan, fuel, races), lifts (Hevy + Garmin) and rides (Garmin). */
export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  const { date: dateParam, view: viewParam } = await searchParams;
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  // Follow what was actually done (missed / off-plan sessions, lift rotation) before reading anything plan-shaped.
  await reconcilePlan().catch((err) => console.error("[plan] reconcile failed", err));
  const selected = normalizeIsoDate(dateParam) ?? today;
  const view = viewParam === "week" || viewParam === "month" ? viewParam : null;
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
  // The dated plan: rules may add suggestions on load; the weekly AI review runs after the response.
  const [activePlan, queueCount, race] = await Promise.all([getActivePlan(), countRunWalkQueue(), getUpcomingRace(today)]);
  if (activePlan) {
    await refreshRuleSuggestions().catch((err) => console.error("[plan] rules failed", err));
    activePlan.suggestions = await getPendingSuggestions(activePlan.plan.id);
    after(() => runWeeklyReviewIfDue().catch((err) => console.error("[plan] weekly review failed", err)));
  }
  const planInRange = (activePlan?.workouts ?? []).filter((w) => w.date >= start && w.date <= end);
  const nextUp =
    activePlan?.workouts.find((w) => w.date > selected && w.kind !== "race" && (w.state === "upcoming" || w.state === "today")) ?? null;
  const dayRides = rides.filter((r) => r.date === selected);
  const rideStreams = await getGarminActivityStreams(dayRides.map((r) => r.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training"
        subtitle="Runs, lifts and rides on one calendar, with run fuel and race carb loads."
      />
      {activePlan ? (
        <PlanCard data={activePlan} today={today} queueCount={queueCount} />
      ) : (
        <PlanSetup
          raceName={race ? raceTitle({ race_name: race.name, event_type: race.event_type }, race.distance_km) : null}
          raceDate={race?.date ?? null}
          queueCount={queueCount}
        />
      )}
      <TrainingApp
        key={selected}
        showQueue={!activePlan}
        planWorkouts={planInRange.filter((w) => w.date === selected)}
        nextUp={nextUp}
        today={today}
        selected={selected}
        view={view}
        range={{
          ...range,
          entries: [...range.entries, ...buildActivityEntries({ lifts: workouts, rides }), ...buildPlanEntries(planInRange)],
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
