import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/charts/ChartCard";
import { StageBars } from "@/components/charts/StageBars";
import { ScoreRing } from "@/components/charts/ScoreRing";
import { ContributorList } from "@/components/charts/ContributorList";
import { Hypnogram } from "@/components/charts/Hypnogram";
import { LazyIntradayChart as IntradayChart } from "@/components/charts/lazyCharts";
import { getGarminDailyHistory } from "@/lib/data/garmin";
import {
  getLatestSleepPeriod,
  getSleepHistory,
  getTimezone,
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
import type { GarminSleepScores, SleepContributors } from "@/types";

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

/** Garmin's sleep score breakdown, in the order the Connect app shows it. */
const GARMIN_PARTS: { key: string; label: string; unit?: string }[] = [
  { key: "totalDuration", label: "Duration" },
  { key: "stress", label: "Stress" },
  { key: "awakeCount", label: "Awakenings" },
  { key: "deepPercentage", label: "Deep sleep", unit: "%" },
  { key: "lightPercentage", label: "Light sleep", unit: "%" },
  { key: "remPercentage", label: "REM sleep", unit: "%" },
  { key: "restlessness", label: "Restlessness" },
];

/** Qualifier → plain word; colors are data (score quality), so accents apply. */
const QUALITY: Record<string, { label: string; color: string }> = {
  EXCELLENT: { label: "Excellent", color: "var(--color-recovery)" },
  GOOD: { label: "Good", color: "var(--color-sleep)" },
  FAIR: { label: "Fair", color: "var(--color-activity)" },
  POOR: { label: "Poor", color: "var(--color-stress)" },
};

const humanize = (s: string) => s.toLowerCase().replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase());

function GarminBreakdown({ scores }: { scores: GarminSleepScores }) {
  return (
    <ul className="space-y-2">
      {GARMIN_PARTS.filter((p) => scores[p.key]).map((p) => {
        const part = scores[p.key]!;
        const quality = part.qualifierKey ? QUALITY[part.qualifierKey] : null;
        return (
          <li key={p.key} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-text-secondary">{p.label}</span>
            <span className="tabular-nums">
              {part.value != null && p.unit ? (
                <span className="text-text-muted mr-2">
                  {Math.round(part.value)}
                  {p.unit}
                </span>
              ) : null}
              <span style={quality ? { color: quality.color } : undefined}>
                {quality?.label ?? (part.qualifierKey ? humanize(part.qualifierKey) : "—")}
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default async function SleepPage() {
  const [sleep, garmin, period, timezone] = await Promise.all([
    getSleepHistory(30),
    getGarminDailyHistory(30),
    getLatestSleepPeriod(),
    getTimezone(),
  ]);

  if (sleep.length === 0) {
    return (
      <div>
        <PageHeader
          title="Sleep"
          subtitle="Stages, efficiency, and sleep debt over time."
        />
        <Card className="flex flex-col items-start gap-3">
          <span className="body-copy">No sleep data yet — wear your Garmin overnight.</span>
          <Link href="/settings/connections" className="text-text-secondary text-sm underline">
            Connections
          </Link>
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
  const latestHrv = latestNonNull(garmin, "hrv_last_night_ms");
  const latestDebt = latestNonNull(sleep, "sleep_debt_seconds");
  const isGarmin = latest.source === "garmin";
  const garminNight = garmin.find((g) => g.date === latest.date) ?? null;
  // Oura's overnight curves only belong to an Oura night.
  const ouraPeriod = !isGarmin && period?.date === detail.date ? period : null;

  const contributors = latest.contributors;
  const contributorItems = SLEEP_CONTRIBUTORS.map(({ key, label }) => ({
    label,
    value: contributors?.[key] ?? null,
  }));

  const hrSeries = expandSample(ouraPeriod?.heart_rate ?? null, timezone);
  const hrvSeries = expandSample(ouraPeriod?.hrv ?? null, timezone);

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
  const hrvTrend = garmin.slice(-14).map((g) => ({
    label: shortDate(g.date),
    value: g.hrv_last_night_ms,
  }));
  const debtTrend = sleep.slice(-14).map((s) => ({
    label: shortDate(s.date),
    value: secondsToHours(s.sleep_debt_seconds),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sleep"
        subtitle={isGarmin ? "Last night's score, stages and vitals from Garmin." : "Last night's stages, contributors, and intraday detail."}
      />

      {/* Score + what drove it (Garmin's breakdown, or Oura's contributors on Oura nights) */}
      <Card className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
        <ScoreRing
          value={latest.score}
          label="Sleep Score"
          accent="sleep"
          caption={shortDate(latest.date)}
        />
        <div className="w-full flex-1 space-y-3">
          {isGarmin ? (
            garminNight?.sleep_scores ? <GarminBreakdown scores={garminNight.sleep_scores} /> : null
          ) : (
            <ContributorList items={contributorItems} accent="sleep" />
          )}
          {isGarmin && garminNight?.sleep_feedback ? (
            <p className="text-text-muted text-xs">{humanize(garminNight.sleep_feedback)}</p>
          ) : null}
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
        {isGarmin ? (
          <>
            <MetricCard label="Awake" value={formatDuration(detail.awake_duration)} accent="sleep" />
            <MetricCard
              label="Sleep stress"
              value={garminNight?.sleep_stress_avg != null ? Math.round(garminNight.sleep_stress_avg) : null}
              accent="stress"
            />
          </>
        ) : (
          <>
            <MetricCard label="Latency" value={formatDuration(detail.latency)} accent="sleep" />
            <MetricCard label="Restfulness" value={detail.restfulness} accent="sleep" />
          </>
        )}
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

      {/* Hypnogram — Oura nights only (Garmin's API has no stage timeline) */}
      {(ouraPeriod?.sleep_phase_5min ?? detail.sleep_phase_5min) ? (
      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="metric-label">Hypnogram</span>
          <span className="timestamp">
            {clockTime(detail.bedtime_start, timezone)} –{" "}
            {clockTime(detail.bedtime_end, timezone)}
          </span>
        </div>
        <Hypnogram phases={ouraPeriod?.sleep_phase_5min ?? detail.sleep_phase_5min} />
      </Card>
      ) : null}

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
        {isGarmin ? (
          <MetricCard
            label="Resting HR"
            value={garminNight?.resting_hr != null ? Math.round(garminNight.resting_hr) : null}
            unit="bpm"
            accent="recovery"
          />
        ) : (
          <MetricCard label="Lowest HR" value={detail.lowest_heart_rate} unit="bpm" accent="recovery" />
        )}
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
        {/* Restless periods + optimal bedtime are Oura-only. */}
        {!isGarmin ? (
          <>
            <MetricCard label="Restless Periods" value={detail.restless_periods} accent="stress" />
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
          </>
        ) : null}
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
        current={latestHrv != null ? `${Math.round(latestHrv)} ms` : null}
        caption="Garmin overnight average HRV (ms)"
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
