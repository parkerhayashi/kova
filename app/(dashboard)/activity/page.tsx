import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/charts/ChartCard";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { getGarminDailyHistory } from "@/lib/data/garmin";
import { getActivityHistory, getTimezone } from "@/lib/data/oura";
import { weekStart } from "@/lib/run-calendar";
import { latestRowWith, shortDate, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Moderate + 2 × vigorous — how Garmin counts intensity minutes toward the weekly goal. */
const intensity = (r: { intensity_moderate_min: number | null; intensity_vigorous_min: number | null }) =>
  r.intensity_moderate_min == null && r.intensity_vigorous_min == null
    ? null
    : (r.intensity_moderate_min ?? 0) + 2 * (r.intensity_vigorous_min ?? 0);

/** Activity — steps vs. goal, intensity minutes, calories and stress from Garmin. */
export default async function ActivityPage() {
  const today = todayInTimezone(await getTimezone());
  const [activity, garmin] = await Promise.all([getActivityHistory(30), getGarminDailyHistory(30)]);

  const day = activity.find((a) => a.date === today) ?? latestRowWith(activity, "steps");
  const gDay = garmin.find((g) => g.date === day?.date) ?? null;
  const stepGoal = gDay?.step_goal ?? 10_000;

  const thisWeek = garmin.filter((g) => g.date >= weekStart(today));
  const weekIntensity = thisWeek.reduce((s, g) => s + (intensity(g) ?? 0), 0);
  const weekGoal = latestRowWith(garmin, "intensity_goal_weekly")?.intensity_goal_weekly ?? 150;

  const last14 = activity.slice(-14);
  const trend = (pick: (a: (typeof activity)[number]) => number | null) =>
    last14.map((a) => ({ label: shortDate(a.date), value: pick(a) }));
  const garminTrend = (pick: (g: (typeof garmin)[number]) => number | null) =>
    garmin.slice(-14).map((g) => ({ label: shortDate(g.date), value: pick(g) }));
  const ouraScores = activity.filter((a) => a.activity_score != null);

  if (!day) {
    return (
      <div>
        <PageHeader title="Activity" subtitle="Steps, intensity minutes, calories and stress." />
        <Card>
          <p className="body-copy text-sm">No activity data yet — it shows up after the next Garmin sync.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Activity" subtitle="Steps, intensity minutes, calories and stress." />

      <Card className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        <ProgressRing
          value={day.steps}
          max={stepGoal}
          label={day.date === today ? "Steps today" : `Steps · ${shortDate(day.date)}`}
          accent="activity"
          size={140}
          format={(v) => Math.round(v).toLocaleString()}
          caption={`Goal ${stepGoal.toLocaleString()}`}
        />
        <div className="w-full flex-1 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="metric-label">Intensity minutes · this week</span>
              <span className="text-text-primary text-sm font-semibold tabular-nums">
                {Math.round(weekIntensity)} / {Math.round(weekGoal)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (weekIntensity / weekGoal) * 100)}%`,
                  background: "var(--color-activity)",
                }}
              />
            </div>
            <p className="text-text-muted text-xs">Vigorous minutes count double, as on your watch.</p>
          </div>
          {gDay?.floors_ascended != null ? (
            <p className="text-text-secondary text-sm">{Math.round(gDay.floors_ascended)} floors climbed</p>
          ) : null}
        </div>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Intensity today"
          value={gDay ? intensity(gDay) : null}
          unit="min"
          accent="activity"
          caption={
            gDay && (gDay.intensity_vigorous_min ?? 0) > 0
              ? `${Math.round(gDay.intensity_vigorous_min!)} vigorous`
              : undefined
          }
        />
        <MetricCard label="Active kcal" value={day.active_calories} accent="activity" />
        <MetricCard label="Total kcal" value={day.total_calories} accent="activity" />
        <MetricCard
          label="High stress"
          value={day.stress_score}
          unit="min"
          accent="stress"
          caption={gDay?.stress_avg != null ? `avg level ${Math.round(gDay.stress_avg)}` : undefined}
        />
      </section>

      <ChartCard
        title="Steps · 14 Days"
        data={trend((a) => a.steps)}
        accent="activity"
        current={day.steps != null ? day.steps.toLocaleString() : null}
      />
      <ChartCard
        title="Intensity Minutes · 14 Days"
        data={garminTrend(intensity)}
        accent="activity"
        caption="Moderate + 2 × vigorous"
      />
      <ChartCard
        title="Active Calories · 14 Days"
        data={trend((a) => a.active_calories)}
        accent="activity"
        current={day.active_calories != null ? `${day.active_calories} kcal` : null}
      />
      <ChartCard
        title="Stress · 14 Days"
        data={garminTrend((g) => g.stress_avg)}
        accent="stress"
        caption="Daily average stress level (0–100)"
      />

      {ouraScores.length > 0 ? (
        <details className="card">
          <summary className="text-text-secondary hover:text-text-primary cursor-pointer text-sm">
            Oura history (activity score until {shortDate(ouraScores.at(-1)!.date)})
          </summary>
          <div className="mt-4">
            <ChartCard
              title="Oura activity score"
              data={ouraScores.map((a) => ({ label: shortDate(a.date), value: a.activity_score }))}
              accent="activity"
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
