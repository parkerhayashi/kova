import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { RunDetail } from "@/components/running/RunDetail";
import { NextRunCard } from "@/components/running/TrainingPlan";
import { PlannedWorkout } from "@/components/training/PlanCard";
import { getActivePlan, nextPlannedRun } from "@/lib/data/plan";
import { Card } from "@/components/ui/Card";
import { getTimezone } from "@/lib/data/oura";
import {
  getRecentActualRuns,
  getRunExtras,
  getTrainingPlan,
  getUpcomingRace,
} from "@/lib/data/running";
import {
  formatDistance,
  formatPace,
  formatRunDuration,
  raceTitle,
  runQuickStats,
  runTypeLabel,
} from "@/lib/run-fuel";
import { buildRunningTrends } from "@/lib/trends/running";
import { formatIsoDateLabel, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RECENT_DAYS = 30;

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="space-y-1">
      <span className="metric-label">{label}</span>
      <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-activity)" }}>
        {value}
        {unit ? <span className="text-text-muted ml-1 text-sm font-normal">{unit}</span> : null}
      </p>
    </div>
  );
}

/** Running: the plan queue, next race, and recent runs. Planning by date lives on Training. */
export default async function RunningPage() {
  const today = todayInTimezone(await getTimezone());
  const [plan, runs, race] = await Promise.all([
    getTrainingPlan(5),
    getRecentActualRuns(RECENT_DAYS),
    getUpcomingRace(today),
  ]);
  const nextPlanned = nextPlannedRun(await getActivePlan());
  const extras = await getRunExtras(runs.filter((r) => r.source === "garmin").map((r) => r.id));
  const { summary } = buildRunningTrends({ runs, readiness: [], sleep: [], range: 30, today });

  return (
    <div className="space-y-6">
      <PageHeader title="Running" subtitle="Your next run, next race, and recent runs." />

      {nextPlanned ? (
        <Card className="space-y-2">
          <div className="flex items-baseline justify-between">
            <span className="metric-label">{nextPlanned.state === "today" ? "Today's run" : "Next run"}</span>
            <Link href="/training" className="text-text-secondary hover:text-text-primary text-xs">
              Plan →
            </Link>
          </div>
          <PlannedWorkout w={nextPlanned} today={today} showActions={false} />
        </Card>
      ) : (
        <NextRunCard plan={plan} />
      )}

      {race ? (
        <Card className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="metric-label">Next race</span>
            <p className="text-sm font-semibold">
              {raceTitle({ race_name: race.name, event_type: race.event_type }, race.distance_km)}
            </p>
            <p className="text-text-muted text-xs">
              {formatIsoDateLabel(race.date)} · {race.days_until} day{race.days_until === 1 ? "" : "s"}
            </p>
          </div>
          <Link
            href={`/training?date=${race.date}`}
            className="text-text-secondary hover:text-text-primary shrink-0 text-xs"
          >
            Race day →
          </Link>
        </Card>
      ) : null}

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={`Miles · ${RECENT_DAYS}d`} value={summary.miles.toString()} />
        <Stat label="Runs" value={summary.runs.toString()} />
        <Stat
          label="Avg pace"
          value={
            summary.avg_pace_min_per_mile != null
              ? formatPace(summary.avg_pace_min_per_mile / 1.609344).replace("/mi", "")
              : "—"
          }
          unit={summary.avg_pace_min_per_mile != null ? "/mi" : undefined}
        />
        <Stat
          label="Avg HR"
          value={summary.avg_hr != null ? String(summary.avg_hr) : "—"}
          unit={summary.avg_hr != null ? "bpm" : undefined}
        />
      </Card>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="metric-label">Recent runs</span>
          <Link href="/training" className="text-text-secondary hover:text-text-primary text-xs">
            Plan or log on the calendar →
          </Link>
        </div>
        {runs.length === 0 ? (
          <Card>
            <p className="body-copy text-sm">No runs in the last {RECENT_DAYS} days.</p>
          </Card>
        ) : (
          runs.map((run) => (
            <Card key={run.id} className="space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {formatRunDuration(run.actual_duration_min)}
                    {run.actual_distance_km != null ? ` · ${formatDistance(run.actual_distance_km)}` : ""}
                    {run.run_type ? ` · ${runTypeLabel(run.run_type)}` : ""}
                  </p>
                  {runQuickStats(run) ? (
                    <p className="text-text-secondary text-xs tabular-nums">{runQuickStats(run)}</p>
                  ) : null}
                  <p className="text-text-muted text-xs">
                    {formatIsoDateLabel(run.date)} ·{" "}
                    {run.source === "garmin" ? "Garmin" : run.source === "oura" ? "Apple Health" : "Manual"}
                  </p>
                </div>
                <Link
                  href={`/training?date=${run.date}`}
                  className="text-text-secondary hover:text-text-primary shrink-0 text-xs"
                >
                  Day →
                </Link>
              </div>
              <RunDetail
                run={run}
                laps={extras[run.id]?.laps ?? []}
                stream={extras[run.id]?.stream ?? null}
              />
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
