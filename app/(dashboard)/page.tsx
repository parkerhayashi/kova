import Link from "next/link";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import {
  getActivityHistory,
  getReadinessHistory,
  getSleepHistory,
  isOuraConnected,
} from "@/lib/data/oura";
import { ordinalToResilience } from "@/lib/oura";
import { latestNonNull, secondsToHours, shortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function signed(value: number | null): string | null {
  if (value === null) return null;
  return value > 0 ? `+${value}` : `${value}`;
}

/**
 * Today — daily at-a-glance summary (blueprint §7). Oura recovery metrics are
 * live as of Phase 2; nutrition, habits, supplements, weight, and workouts
 * land in later phases.
 */
export default async function TodayPage() {
  // Oura finalizes a day's detailed records hours after the score lands, so the
  // current-day row is often a partial stub. Read each headline from the most
  // recent populated reading (mirrors how Oura's own app surfaces metrics).
  const [sleepRows, readinessRows, activityRows, connected] = await Promise.all([
    getSleepHistory(400),
    getReadinessHistory(400),
    getActivityHistory(400),
    isOuraConnected(),
  ]);

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

  const lastSync =
    [
      readinessRows.at(-1)?.date,
      sleepRows.at(-1)?.date,
      activityRows.at(-1)?.date,
    ]
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;

  return (
    <div className="space-y-8">
      <header className="mb-2 flex items-end justify-between gap-4">
        <div>
          <p className="metric-label">Today</p>
          <h1 className="section-heading mt-1">{today}</h1>
        </div>
        {lastSync ? (
          <span className="timestamp">Oura synced {shortDate(lastSync)}</span>
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

      {/* Nutrition + hydration (Phase 6) */}
      <section className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <span className="metric-label">Calories</span>
          <div className="flex items-baseline gap-2">
            <span className="metric-value" style={{ color: "var(--color-nutrition)" }}>
              —
            </span>
            <span className="text-text-muted text-sm">in / out</span>
          </div>
          <div className="text-text-muted flex gap-4 text-xs">
            <span>Protein —</span>
            <span>Carbs —</span>
            <span>Fat —</span>
          </div>
        </Card>
        <MetricCard
          label="Water"
          value={null}
          unit="ml"
          accent="sleep"
          caption="Goal 3000 ml"
        />
      </section>

      {/* Activity today */}
      <section className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Steps</span>
          <span className="metric-value" style={{ color: "var(--color-activity)" }}>
            {steps?.toLocaleString() ?? "—"}
          </span>
          <span className="timestamp">
            {activeCalories != null
              ? `${activeCalories} active kcal`
              : "Workout view in Phase 4"}
          </span>
        </Card>
        <section className="grid grid-cols-2 gap-3">
          <MetricCard label="Active kcal" value={activeCalories} accent="activity" />
          <MetricCard label="Total kcal" value={totalCalories} accent="activity" />
        </section>
      </section>

      {/* Checklists + weight + sleep debt */}
      <section className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Habits</span>
          <span className="body-copy">Habit tracking lands in Phase 3</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Supplements</span>
          <span className="body-copy">Supplement tracking lands in Phase 3</span>
        </Card>
        <MetricCard
          label="Weight"
          value={null}
          unit="lbs"
          accent="nutrition"
          caption="Phase 3"
        />
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
