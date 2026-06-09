import Link from "next/link";
import { MetricCard } from "@/components/MetricCard";
import { OuraRefreshControl } from "@/components/oura/OuraRefreshControl";
import { Card } from "@/components/ui/Card";
import {
  getActivityHistory,
  getOuraLastSyncedAt,
  getReadinessHistory,
  getSleepHistory,
  getTimezone,
  isOuraConnected,
} from "@/lib/data/oura";
import {
  getDailyTotals,
  getNutritionGoals,
} from "@/lib/data/nutrition";
import { burnSourceLabel } from "@/lib/nutrition-goals";
import { getWaterState } from "@/lib/data/water";
import {
  getHabitLogs,
  getHabits,
  getSupplementLogs,
  getSupplements,
} from "@/lib/data/tracking";
import { ordinalToResilience } from "@/lib/oura";
import {
  computeTargetMl,
  normalizeWater,
  unitVolMl,
} from "@/lib/water";
import {
  latestNonNull,
  secondsToHours,
  todayInTimezone,
} from "@/lib/utils";

export const dynamic = "force-dynamic";

function signed(value: number | null): string | null {
  if (value === null) return null;
  return value > 0 ? `+${value}` : `${value}`;
}

/**
 * Today — daily health at-a-glance from Oura plus tracking summaries. The app
 * home (/) is now the personal dashboard; this is the health snapshot.
 */
export default async function TodayPage() {
  // Oura finalizes a day's detailed records hours after the score lands, so the
  // current-day row is often a partial stub. Read each headline from the most
  // recent populated reading (mirrors how Oura's own app surfaces metrics).
  const [
    sleepRows,
    readinessRows,
    activityRows,
    connected,
    timezone,
    ouraLastSyncedAt,
    habits,
    habitLogs,
    supplements,
    supplementLogs,
  ] = await Promise.all([
    getSleepHistory(400),
    getReadinessHistory(400),
    getActivityHistory(400),
    isOuraConnected(),
    getTimezone(),
    getOuraLastSyncedAt(),
    getHabits(true),
    getHabitLogs(1),
    getSupplements(true),
    getSupplementLogs(1),
  ]);

  const todayIso = todayInTimezone(timezone);
  const [mealTotals, nutritionGoals, waterState] = await Promise.all([
    getDailyTotals(todayIso),
    getNutritionGoals(todayIso),
    getWaterState(),
  ]);
  const water = normalizeWater(waterState);
  const waterUnits = water.logs[todayIso] ?? 0;
  const waterMl = Math.round(waterUnits * unitVolMl(water));
  const waterGoalMl = Math.round(computeTargetMl(water).total);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });

  const habitsDone = habitLogs.filter(
    (l) => l.date === todayIso && l.completed,
  ).length;
  const supplementsTaken = supplementLogs.filter(
    (l) => l.date === todayIso && l.taken,
  ).length;

  const hasOuraData =
    sleepRows.length > 0 || readinessRows.length > 0 || activityRows.length > 0;

  const sleepScore = latestNonNull(sleepRows, "score");
  const sleepDebt = latestNonNull(sleepRows, "sleep_debt_seconds");

  const readinessScore = latestNonNull(readinessRows, "score");
  const hrv = latestNonNull(readinessRows, "hrv_balance");
  const restingHr = latestNonNull(readinessRows, "resting_heart_rate");
  const cardioAge = latestNonNull(readinessRows, "cardiovascular_age");
  const resilience = latestNonNull(readinessRows, "resilience_score");
  const bodyTemp = latestNonNull(readinessRows, "body_temperature");

  const activityScore = latestNonNull(activityRows, "activity_score");
  const stress = latestNonNull(activityRows, "stress_score");
  const vo2Max = latestNonNull(activityRows, "vo2_max");
  const steps = latestNonNull(activityRows, "steps");
  const activeCalories = latestNonNull(activityRows, "active_calories");
  const totalCalories = latestNonNull(activityRows, "total_calories");
  const spo2 = latestNonNull(activityRows, "spo2_avg");

  return (
    <div className="space-y-8">
      <header className="mb-2 flex items-end justify-between gap-4">
        <div>
          <p className="metric-label">Today</p>
          <h1 className="section-heading mt-1">{today}</h1>
        </div>
        {connected ? (
          <OuraRefreshControl
            lastSyncedAt={ouraLastSyncedAt}
            timeZone={timezone}
          />
        ) : null}
      </header>

      {!connected && (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="metric-label">Oura</span>
            <span className="body-copy">
              Connect your Oura Ring to populate recovery, sleep, and activity.
            </span>
          </div>
          <Link
            href="/api/auth/oura"
            className="border-border-strong hover:bg-surface-raised inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm transition-colors"
          >
            Connect Oura
          </Link>
        </Card>
      )}

      {connected && !hasOuraData && (
        <Card>
          <span className="body-copy">
            Oura is connected. Waiting for the first sync — data appears here
            once it completes.
          </span>
        </Card>
      )}

      {/* The three Oura scores */}
      <section className="grid grid-cols-3 gap-3">
        <MetricCard label="Readiness" value={readinessScore} accent="recovery" />
        <MetricCard label="Sleep" value={sleepScore} accent="sleep" />
        <MetricCard label="Activity" value={activityScore} accent="activity" />
      </section>

      {/* Recovery vitals */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="HRV" value={hrv} unit="ms" accent="recovery" />
        <MetricCard label="Resting HR" value={restingHr} unit="bpm" accent="recovery" />
        <MetricCard label="Stress" value={stress} unit="min" accent="stress" />
        <MetricCard
          label="Resilience"
          value={ordinalToResilience(resilience)}
          accent="recovery"
        />
      </section>

      {/* Long-horizon cardiovascular metrics */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Cardio Age" value={cardioAge} unit="yr" accent="recovery" />
        <MetricCard
          label="VO₂ Max"
          value={vo2Max != null ? Math.round(vo2Max * 10) / 10 : null}
          accent="activity"
          caption={vo2Max == null ? "Take the VO₂ Max test in Oura" : undefined}
        />
        <MetricCard
          label="Body Temp"
          value={signed(bodyTemp)}
          unit="°C"
          accent="recovery"
          caption="Deviation"
        />
        <MetricCard label="SpO₂" value={spo2} unit="%" accent="sleep" />
      </section>

      {/* Nutrition + hydration */}
      <section className="grid gap-3 md:grid-cols-2">
        <Link href="/nutrition" className="block">
          <Card className="card-interactive flex flex-col gap-3">
            <span className="metric-label">Calories</span>
            <div className="flex items-baseline gap-2">
              <span className="metric-value" style={{ color: "var(--color-nutrition)" }}>
                {mealTotals.calories != null
                  ? Math.round(mealTotals.calories)
                  : "—"}
              </span>
              <span className="text-text-muted text-sm">
                in / {nutritionGoals.meta.oura_burn} burn
              </span>
            </div>
            <div className="text-text-muted flex gap-4 text-xs">
              <span>
                Protein{" "}
                {mealTotals.protein_g != null
                  ? `${Math.round(mealTotals.protein_g)}g`
                  : "—"}
              </span>
              <span>
                Carbs{" "}
                {mealTotals.carbs_g != null
                  ? `${Math.round(mealTotals.carbs_g)}g`
                  : "—"}
              </span>
              <span>
                Fat{" "}
                {mealTotals.fat_g != null ? `${Math.round(mealTotals.fat_g)}g` : "—"}
              </span>
            </div>
            <span className="timestamp">
              Goal {nutritionGoals.calories} kcal ({burnSourceLabel(nutritionGoals.meta.burn_source).toLowerCase()}) · tap to log meals
            </span>
          </Card>
        </Link>
        <Link href="/water" className="block">
          <MetricCard
            label="Water"
            value={waterMl > 0 ? waterMl : null}
            unit={`/ ${waterGoalMl} ml`}
            accent="sleep"
            caption={waterMl > 0 ? "logged today" : "tap to log"}
            className="card-interactive h-full"
          />
        </Link>
      </section>

      {/* Activity today */}
      <section className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Steps</span>
          <span className="metric-value" style={{ color: "var(--color-activity)" }}>
            {steps?.toLocaleString() ?? "—"}
          </span>
          <span className="timestamp">
            {activeCalories != null ? `${activeCalories} active kcal` : "from Oura"}
          </span>
        </Card>
        <section className="grid grid-cols-2 gap-3">
          <MetricCard label="Active kcal" value={activeCalories} accent="activity" />
          <MetricCard label="Total kcal" value={totalCalories} accent="activity" />
        </section>
      </section>

      {/* Checklists + training + sleep debt */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link href="/habits" className="cursor-pointer">
          <MetricCard
            label="Habits"
            value={habits.length ? `${habitsDone}/${habits.length}` : null}
            accent="recovery"
            caption={habits.length ? "done today" : "add habits"}
            className="card-interactive h-full"
          />
        </Link>
        <Link href="/supplements" className="cursor-pointer">
          <MetricCard
            label="Supplements"
            value={
              supplements.length
                ? `${supplementsTaken}/${supplements.length}`
                : null
            }
            accent="nutrition"
            caption={supplements.length ? "taken today" : "add supplements"}
            className="card-interactive h-full"
          />
        </Link>
        <Link href="/workouts" className="cursor-pointer">
          <MetricCard
            label="Workouts"
            value={null}
            accent="activity"
            caption="log a session"
            className="card-interactive h-full"
          />
        </Link>
        <MetricCard
          label="Sleep Debt"
          value={secondsToHours(sleepDebt)}
          unit="hrs"
          accent="stress"
          caption="14-day running total"
        />
      </section>
    </div>
  );
}
