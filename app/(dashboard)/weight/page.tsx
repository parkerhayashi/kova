import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { WeightForm } from "@/components/weight/WeightForm";
import { WeightTrend } from "@/components/weight/WeightTrend";
import { getTimezone, getUserSettings } from "@/lib/data/oura";
import { getWeightLogs } from "@/lib/data/tracking";
import { shortDate, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WeightPage() {
  const [logs, settings, timezone] = await Promise.all([
    getWeightLogs(90),
    getUserSettings(),
    getTimezone(),
  ]);
  const today = todayInTimezone(timezone);

  const latest = logs.length ? logs[logs.length - 1] : null;
  const prev = logs.length > 1 ? logs[logs.length - 2] : null;
  const todayEntry = logs.find((l) => l.date === today);

  const change =
    latest && prev ? Math.round((latest.weight_lbs - prev.weight_lbs) * 10) / 10 : null;
  const goal = settings?.weight_goal_lbs ?? null;
  const toGoal =
    latest && goal != null
      ? Math.round((latest.weight_lbs - goal) * 10) / 10
      : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Weight" subtitle="Body composition and trend." />

      <WeightForm
        defaultDate={today}
        initial={
          todayEntry
            ? {
                weight_lbs: todayEntry.weight_lbs,
                body_fat_pct: todayEntry.body_fat_pct,
                notes: todayEntry.notes,
              }
            : undefined
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Current"
          value={latest ? latest.weight_lbs : null}
          unit="lbs"
          accent="nutrition"
          caption={latest ? shortDate(latest.date) : undefined}
        />
        <MetricCard
          label="Change"
          value={change != null ? (change > 0 ? `+${change}` : `${change}`) : null}
          unit="lbs"
          accent="nutrition"
          caption={prev ? `since ${shortDate(prev.date)}` : undefined}
        />
        <MetricCard
          label="Body Fat"
          value={latest?.body_fat_pct ?? null}
          unit="%"
          accent="nutrition"
        />
        <MetricCard
          label={toGoal != null && toGoal > 0 ? "To Goal" : "Goal"}
          value={
            goal == null
              ? null
              : toGoal && toGoal > 0
                ? Math.abs(toGoal)
                : "Reached"
          }
          unit={toGoal && toGoal > 0 ? "lbs" : undefined}
          accent="nutrition"
          caption={goal != null ? `target ${goal} lbs` : "set a goal in settings"}
        />
      </section>

      {logs.length > 0 ? (
        <WeightTrend logs={logs} today={today} />
      ) : (
        <Card>
          <p className="body-copy text-sm">
            No weight entries yet. Log your first above to start the trend.
          </p>
        </Card>
      )}
    </div>
  );
}
