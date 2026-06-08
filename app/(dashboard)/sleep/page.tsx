import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/charts/ChartCard";
import { StageBars } from "@/components/charts/StageBars";
import { ScoreRing } from "@/components/charts/ScoreRing";
import { ContributorList } from "@/components/charts/ContributorList";
import { Hypnogram } from "@/components/charts/Hypnogram";
import { IntradayChart } from "@/components/charts/IntradayChart";
import {
  getLatestSleepPeriod,
  getReadinessHistory,
  getSleepHistory,
  isOuraConnected,
} from "@/lib/data/oura";
import {
  clockTime,
  expandSample,
  formatDuration,
  latestNonNull,
  latestRowWith,
  offsetToClock,
  secondsToHours,
  shortDate,
} from "@/lib/utils";
import type { SleepContributors } from "@/types";

export const dynamic = "force-dynamic";

const SLEEP_CONTRIBUTORS: { key: keyof SleepContributors; label: string }[] = [
  { key: "total_sleep", label: "Total Sleep" },
  { key: "efficiency", label: "Efficiency" },
  { key: "restfulness", label: "Restfulness" },
  { key: "rem_sleep", label: "REM Sleep" },
  { key: "deep_sleep", label: "Deep Sleep" },
  { key: "latency", label: "Latency" },
  { key: "timing", label: "Timing" },
];

export default async function SleepPage() {
  const [sleep, readiness, period, connected] = await Promise.all([
    getSleepHistory(30),
    getReadinessHistory(14),
    getLatestSleepPeriod(),
    isOuraConnected(),
  ]);

  if (sleep.length === 0) {
    return (
      <div>
        <PageHeader
          title="Sleep"
          subtitle="Stages, efficiency, and sleep debt over time."
        />
        <Card className="flex flex-col items-start gap-3">
          <span className="body-copy">No sleep data yet.</span>
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

  // The headline reflects the most recently scored night (today, if Oura has
  // scored it). Stage/duration detail can lag the score by a few hours, so the
  // detailed sections fall back to the latest night that actually has it.
  const latest = latestRowWith(sleep, "score") ?? sleep[sleep.length - 1];
  const detail = latestRowWith(sleep, "total_sleep_duration") ?? latest;
  const detailStale = detail.date !== latest.date;
  const bedtimeRow = latestRowWith(sleep, "optimal_bedtime_start");
  const latestHrv = latestNonNull(readiness, "hrv_balance");
  const latestDebt = latestNonNull(sleep, "sleep_debt_seconds");

  const contributors = latest.contributors;
  const contributorItems = SLEEP_CONTRIBUTORS.map(({ key, label }) => ({
    label,
    value: contributors?.[key] ?? null,
  }));

  const hrSeries = expandSample(period?.heart_rate ?? null);
  const hrvSeries = expandSample(period?.hrv ?? null);

  const scored = sleep.filter((s) => s.score !== null);
  const best = scored.reduce<(typeof scored)[number] | null>(
    (b, s) => (b === null || (s.score ?? 0) > (b.score ?? 0) ? s : b),
    null,
  );
  const worst = scored.reduce<(typeof scored)[number] | null>(
    (w, s) => (w === null || (s.score ?? 0) < (w.score ?? 0) ? s : w),
    null,
  );

  const scoreTrend = sleep.slice(-14).map((s) => ({
    label: shortDate(s.date),
    value: s.score,
  }));
  const hrvTrend = readiness.map((r) => ({
    label: shortDate(r.date),
    value: r.hrv_balance,
  }));
  const debtTrend = sleep.slice(-14).map((s) => ({
    label: shortDate(s.date),
    value: secondsToHours(s.sleep_debt_seconds),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sleep"
        subtitle="Last night's stages, contributors, and intraday detail."
      />

      {/* Score + contributors (Oura's sleep screen) */}
      <Card className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
        <ScoreRing
          value={latest.score}
          label="Sleep Score"
          accent="sleep"
          caption={shortDate(latest.date)}
        />
        <div className="w-full flex-1">
          <ContributorList items={contributorItems} accent="sleep" />
        </div>
      </Card>

      {detailStale ? (
        <p className="timestamp">
          Stage detail below is from {shortDate(detail.date)} — Oura hasn&apos;t
          finished processing {shortDate(latest.date)} yet.
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Time Asleep"
          value={formatDuration(detail.total_sleep_duration)}
          accent="sleep"
        />
        <MetricCard
          label="Efficiency"
          value={detail.efficiency}
          unit="%"
          accent="sleep"
        />
        <MetricCard
          label="Latency"
          value={formatDuration(detail.latency)}
          accent="sleep"
        />
        <MetricCard label="Restfulness" value={detail.restfulness} accent="sleep" />
      </section>

      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="metric-label">Stages · {shortDate(detail.date)}</span>
          <span className="text-text-primary text-lg font-medium tracking-tight">
            {formatDuration(detail.total_sleep_duration)}
          </span>
        </div>
        <StageBars
          rem={detail.rem_sleep_duration}
          deep={detail.deep_sleep_duration}
          light={detail.light_sleep_duration}
          awake={detail.awake_duration}
        />
      </Card>

      {/* Hypnogram */}
      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="metric-label">Hypnogram</span>
          <span className="timestamp">
            {clockTime(detail.bedtime_start)} – {clockTime(detail.bedtime_end)}
          </span>
        </div>
        <Hypnogram phases={period?.sleep_phase_5min ?? detail.sleep_phase_5min} />
      </Card>

      {/* Intraday heart rate + HRV during sleep */}
      {hrSeries.length > 0 && (
        <Card className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="metric-label">Heart Rate · Last Night</span>
            <span className="text-text-primary text-lg font-medium tracking-tight">
              {detail.lowest_heart_rate ?? "—"}{" "}
              <span className="text-text-muted text-sm">low bpm</span>
            </span>
          </div>
          <IntradayChart data={hrSeries} accent="recovery" unit="bpm" />
        </Card>
      )}

      {hrvSeries.length > 0 && (
        <Card className="space-y-4">
          <div className="flex items-baseline justify-between">
            <span className="metric-label">HRV · Last Night</span>
            <span className="text-text-primary text-lg font-medium tracking-tight">
              {latestHrv ?? "—"} <span className="text-text-muted text-sm">avg ms</span>
            </span>
          </div>
          <IntradayChart data={hrvSeries} accent="recovery" unit="ms" />
        </Card>
      )}

      {/* Vitals + bedtime detail */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Avg HR"
          value={detail.average_heart_rate != null
            ? Math.round(detail.average_heart_rate)
            : null}
          unit="bpm"
          accent="recovery"
        />
        <MetricCard
          label="Lowest HR"
          value={detail.lowest_heart_rate}
          unit="bpm"
          accent="recovery"
        />
        <MetricCard
          label="Avg Breath"
          value={detail.average_breath != null
            ? Math.round(detail.average_breath * 10) / 10
            : null}
          unit="/min"
          accent="sleep"
        />
        <MetricCard
          label="Time in Bed"
          value={formatDuration(detail.time_in_bed)}
          accent="sleep"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Restless Periods"
          value={detail.restless_periods}
          accent="stress"
        />
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Optimal Bedtime</span>
          <span className="text-text-primary text-lg font-medium tracking-tight">
            {offsetToClock(bedtimeRow?.optimal_bedtime_start)} –{" "}
            {offsetToClock(bedtimeRow?.optimal_bedtime_end)}
          </span>
          {bedtimeRow?.bedtime_recommendation ? (
            <span className="timestamp">
              {bedtimeRow.bedtime_recommendation.replace(/_/g, " ")} ·{" "}
              {shortDate(bedtimeRow.date)}
            </span>
          ) : null}
        </Card>
        <MetricCard
          label="Sleep Debt"
          value={secondsToHours(latestDebt)}
          unit="hrs"
          accent="stress"
          caption="14-day running total"
        />
      </section>

      {/* Trends */}
      <ChartCard
        title="Sleep Score · 14 Days"
        data={scoreTrend}
        accent="sleep"
        current={latest.score != null ? String(latest.score) : null}
      />
      <ChartCard
        title="HRV During Sleep"
        data={hrvTrend}
        accent="recovery"
        current={latestHrv != null ? `${latestHrv} ms` : null}
        caption="Nightly average HRV (ms)"
      />
      <ChartCard
        title="Sleep Debt · 14 Days"
        data={debtTrend}
        accent="stress"
        current={
          secondsToHours(latestDebt) != null
            ? `${secondsToHours(latestDebt)} hrs`
            : null
        }
        caption="Running deficit vs. sleep need"
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Best Night</span>
          <span className="metric-value" style={{ color: "var(--color-sleep)" }}>
            {best?.score ?? "—"}
          </span>
          <span className="timestamp">{best ? shortDate(best.date) : "—"}</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Worst Night</span>
          <span className="metric-value" style={{ color: "var(--color-stress)" }}>
            {worst?.score ?? "—"}
          </span>
          <span className="timestamp">{worst ? shortDate(worst.date) : "—"}</span>
        </Card>
      </section>
    </div>
  );
}
