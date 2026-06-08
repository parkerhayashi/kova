import Link from "next/link";
import { Dumbbell, Plus, Trophy } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ChartCard } from "@/components/charts/ChartCard";
import { getTimezone } from "@/lib/data/oura";
import { getPersonalRecords, getSessionSummaries } from "@/lib/data/workouts";
import { addDays, shortDate, todayInTimezone } from "@/lib/utils";
import { newWorkout } from "./actions";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage() {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const weekAgo = addDays(today, -6);

  const [summaries, prs] = await Promise.all([
    getSessionSummaries(120),
    getPersonalRecords(),
  ]);

  const thisWeek = summaries.filter((s) => s.session.date >= weekAgo);
  const weekVolume = thisWeek.reduce((n, s) => n + s.volume, 0);
  const weekSets = thisWeek.reduce((n, s) => n + s.setCount, 0);

  // Oldest → newest for the trend line.
  const volumeTrend = [...summaries]
    .reverse()
    .map((s) => ({ label: shortDate(s.session.date), value: s.volume }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <PageHeader title="Workouts" subtitle="Strength sessions logged in Kova." />
        <form action={newWorkout}>
          <Button type="submit">
            <Plus className="size-4" /> New Workout
          </Button>
        </form>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="This Week"
          value={thisWeek.length ? weekVolume.toLocaleString() : null}
          unit="lbs"
          accent="activity"
          caption="volume"
        />
        <MetricCard
          label="Sessions / 7d"
          value={thisWeek.length || null}
          accent="activity"
          caption="this week"
        />
        <MetricCard
          label="Sets / 7d"
          value={weekSets || null}
          accent="activity"
          caption="working sets"
        />
        <MetricCard
          label="Exercises"
          value={prs.length || null}
          caption="in your library"
        />
      </section>

      {volumeTrend.some((d) => d.value > 0) ? (
        <ChartCard
          title="Training Volume"
          data={volumeTrend}
          accent="activity"
          current={weekVolume ? `${weekVolume.toLocaleString()} lbs this week` : null}
          caption="Working-set volume per session (lbs)"
        />
      ) : null}

      <section className="space-y-3">
        <h2 className="section-heading">History</h2>
        {summaries.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 py-10 text-center">
            <Dumbbell className="text-text-muted size-7" strokeWidth={1.5} />
            <p className="body-copy text-sm">
              No workouts logged yet. Start your first session to begin tracking
              volume and PRs.
            </p>
            <form action={newWorkout}>
              <Button type="submit">
                <Plus className="size-4" /> New Workout
              </Button>
            </form>
          </Card>
        ) : (
          <Card className="divide-border divide-y p-0">
            {summaries.map(({ session, volume, setCount, exerciseCount }) => (
              <Link
                key={session.id}
                href={`/workouts/${session.id}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-[rgba(255,255,255,0.03)]"
              >
                <div className="flex-1">
                  <p className="text-text-primary text-sm font-medium">
                    {session.title || "Workout"}
                  </p>
                  <p className="timestamp mt-0.5">{shortDate(session.date)}</p>
                </div>
                <div className="text-right">
                  <p
                    className="metric-value text-lg"
                    style={{ color: "var(--color-activity)" }}
                  >
                    {volume.toLocaleString()}
                    <span className="text-text-muted ml-1 text-xs font-normal">lbs</span>
                  </p>
                  <p className="timestamp">
                    {exerciseCount} ex · {setCount} sets
                  </p>
                </div>
              </Link>
            ))}
          </Card>
        )}
      </section>

      {prs.length > 0 ? (
        <section className="space-y-3">
          <h2 className="section-heading inline-flex items-center gap-2">
            <Trophy className="size-4 text-[color:var(--color-activity)]" strokeWidth={1.5} />
            Personal Records
          </h2>
          <Card className="divide-border divide-y p-0">
            {prs.slice(0, 10).map((pr) => (
              <div
                key={pr.exercise.id}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <span className="text-text-secondary text-sm">{pr.exercise.name}</span>
                <div className="flex items-center gap-6 text-right">
                  <span className="text-text-muted text-xs">
                    {pr.topWeight.toLocaleString()} × {pr.topWeightReps}
                  </span>
                  <span
                    className="metric-value w-20 text-base"
                    style={{ color: "var(--color-activity)" }}
                  >
                    {pr.best1RM.toLocaleString()}
                    <span className="text-text-muted ml-1 text-xs font-normal">e1RM</span>
                  </span>
                </div>
              </div>
            ))}
          </Card>
        </section>
      ) : null}
    </div>
  );
}
