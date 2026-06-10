import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/charts/ChartCard";
import { ScoreRing } from "@/components/charts/ScoreRing";
import { ContributorList } from "@/components/charts/ContributorList";
import { LazyIntradayChart as IntradayChart } from "@/components/charts/lazyCharts";
import {
  getActivityHistory,
  getLatestHeartRateDay,
  getTimezone,
  isOuraConnected,
} from "@/lib/data/oura";
import {
  formatDuration,
  heartRateSeries,
  latestNonNull,
  latestRowWith,
  shortDate,
} from "@/lib/utils";
import type { ActivityContributors } from "@/types";

export const dynamic = "force-dynamic";

const ACTIVITY_CONTRIBUTORS: { key: keyof ActivityContributors; label: string }[] =
  [
    { key: "stay_active", label: "Stay Active" },
    { key: "move_every_hour", label: "Move Every Hour" },
    { key: "meet_daily_targets", label: "Meet Daily Targets" },
    { key: "training_frequency", label: "Training Frequency" },
    { key: "training_volume", label: "Training Volume" },
    { key: "recovery_time", label: "Recovery Time" },
  ];

// Activity-intensity segments — data, so semantic accents are allowed.
const INTENSITY = [
  { key: "high_activity_time", label: "High", color: "var(--color-activity)" },
  { key: "medium_activity_time", label: "Medium", color: "var(--color-nutrition)" },
  { key: "low_activity_time", label: "Low", color: "var(--color-sleep)" },
  { key: "sedentary_time", label: "Sedentary", color: "rgba(255,255,255,0.22)" },
] as const;

export default async function ActivityPage() {
  const [activity, hrDay, connected, timezone] = await Promise.all([
    getActivityHistory(30),
    getLatestHeartRateDay(),
    isOuraConnected(),
    getTimezone(),
  ]);

  if (activity.length === 0) {
    return (
      <div>
        <PageHeader title="Activity" subtitle="Movement, calories, and goals." />
        <Card className="flex flex-col items-start gap-3">
          <span className="body-copy">No activity data yet.</span>
          {!connected && (
            <Link
              href="/api/auth/oura"
              className="border-border-strong hover:bg-surface-raised inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm transition-colors"
            >
              Connect Oura
            </Link>
          )}
        </Card>
      </div>
    );
  }

  const today = latestRowWith(activity, "activity_score") ?? activity[activity.length - 1];
  const activityScore = latestNonNull(activity, "activity_score");
  const steps = latestNonNull(activity, "steps");
  const activeCalories = latestNonNull(activity, "active_calories");
  const totalCalories = latestNonNull(activity, "total_calories");
  const walkingDistance = latestNonNull(activity, "equivalent_walking_distance");
  const stress = latestNonNull(activity, "stress_score");
  const spo2 = latestNonNull(activity, "spo2_avg");

  const contributors = latestRowWith(activity, "contributors")?.contributors ?? null;
  const contributorItems = ACTIVITY_CONTRIBUTORS.map(({ key, label }) => ({
    label,
    value: contributors?.[key] ?? null,
  }));

  const intensityTotal =
    INTENSITY.reduce((sum, { key }) => sum + (today[key] ?? 0), 0) || 1;

  const hrSeries = heartRateSeries(hrDay?.samples ?? null, timezone);

  const targetCalories = today.target_calories;
  const movePct =
    targetCalories && activeCalories != null
      ? Math.min(100, Math.round((activeCalories / targetCalories) * 100))
      : null;

  const scoreTrend = activity.slice(-14).map((a) => ({
    label: shortDate(a.date),
    value: a.activity_score,
  }));
  const stepsTrend = activity.slice(-14).map((a) => ({
    label: shortDate(a.date),
    value: a.steps,
  }));
  const calorieTrend = activity.slice(-14).map((a) => ({
    label: shortDate(a.date),
    value: a.active_calories,
  }));
  const stressTrend = activity.slice(-14).map((a) => ({
    label: shortDate(a.date),
    value: a.stress_score,
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" subtitle="Movement, calories, intensity, and goals." />

      {/* Score + contributors */}
      <Card className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        <ScoreRing value={activityScore} label="Activity" accent="activity" />
        <div className="w-full flex-1">
          <ContributorList items={contributorItems} accent="activity" />
        </div>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Steps" value={steps?.toLocaleString() ?? null} accent="activity" />
        <MetricCard label="Active kcal" value={activeCalories} accent="activity" />
        <MetricCard label="Total kcal" value={totalCalories} accent="activity" />
        <MetricCard
          label="Walking Eq."
          value={walkingDistance != null ? Math.round(walkingDistance / 100) / 10 : null}
          unit="km"
          accent="activity"
        />
      </section>

      {/* Move goal progress */}
      {movePct !== null && (
        <Card className="space-y-3">
          <div className="flex items-baseline justify-between">
            <span className="metric-label">Move Goal</span>
            <span className="text-text-primary text-lg font-medium tracking-tight">
              {activeCalories} / {targetCalories} kcal
            </span>
          </div>
          <span className="bg-[rgba(255,255,255,0.06)] relative block h-2 w-full overflow-hidden rounded-full">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{ width: `${movePct}%`, background: "var(--color-activity)" }}
            />
          </span>
          <span className="timestamp">{movePct}% of daily target</span>
        </Card>
      )}

      {/* Intensity breakdown */}
      <Card className="space-y-4">
        <span className="metric-label">Activity Breakdown</span>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full">
          {INTENSITY.map(({ key, label, color }) => {
            const pct = ((today[key] ?? 0) / intensityTotal) * 100;
            return (
              <div key={label} style={{ width: `${pct}%`, background: color }} />
            );
          })}
        </div>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          {INTENSITY.map(({ key, label, color }) => (
            <li key={label} className="flex items-center gap-2">
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: color }}
              />
              <span className="metric-label">{label}</span>
              <span className="text-text-secondary ml-auto text-sm tabular-nums">
                {formatDuration(today[key])}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* All-day heart rate */}
      {hrSeries.length > 0 && (
        <Card className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="metric-label">Heart Rate · All Day</span>
            <span className="timestamp">
              {hrDay ? shortDate(hrDay.date) : ""}
            </span>
          </div>
          <IntradayChart data={hrSeries} accent="recovery" unit="bpm" />
        </Card>
      )}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Resting Time"
          value={formatDuration(today.resting_time)}
          accent="sleep"
        />
        <MetricCard
          label="Stress"
          value={stress}
          unit="min"
          accent="stress"
          caption="High-stress time"
        />
        <MetricCard label="SpO₂" value={spo2} unit="%" accent="sleep" />
        <MetricCard
          label="Inactivity Alerts"
          value={today.inactivity_alerts}
          accent="stress"
        />
      </section>

      {/* Trends */}
      <ChartCard
        title="Activity Score · 14 Days"
        data={scoreTrend}
        accent="activity"
        current={activityScore != null ? String(activityScore) : null}
      />
      <section className="grid gap-3 sm:grid-cols-2">
        <ChartCard
          title="Steps"
          data={stepsTrend}
          accent="activity"
          current={steps != null ? steps.toLocaleString() : null}
        />
        <ChartCard
          title="Active Calories"
          data={calorieTrend}
          accent="activity"
          current={activeCalories != null ? `${activeCalories} kcal` : null}
        />
      </section>
      <ChartCard
        title="Stress · High-stress minutes"
        data={stressTrend}
        accent="stress"
        current={stress != null ? `${stress} min` : null}
      />
    </div>
  );
}
