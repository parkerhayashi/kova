import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/charts/ChartCard";
import { ScoreRing } from "@/components/charts/ScoreRing";
import { ContributorList } from "@/components/charts/ContributorList";
import {
  getActivityHistory,
  getReadinessHistory,
  isOuraConnected,
} from "@/lib/data/oura";
import { ordinalToResilience } from "@/lib/oura";
import { latestNonNull, latestRowWith, rollingAverage, shortDate } from "@/lib/utils";
import type { ReadinessContributors, ResilienceContributors } from "@/types";

export const dynamic = "force-dynamic";

const READINESS_CONTRIBUTORS: { key: keyof ReadinessContributors; label: string }[] =
  [
    { key: "previous_night", label: "Previous Night" },
    { key: "sleep_balance", label: "Sleep Balance" },
    { key: "previous_day_activity", label: "Previous Day Activity" },
    { key: "activity_balance", label: "Activity Balance" },
    { key: "body_temperature", label: "Body Temperature" },
    { key: "hrv_balance", label: "HRV Balance" },
    { key: "resting_heart_rate", label: "Resting Heart Rate" },
    { key: "recovery_index", label: "Recovery Index" },
  ];

const RESILIENCE_CONTRIBUTORS: {
  key: keyof ResilienceContributors;
  label: string;
}[] = [
  { key: "sleep_recovery", label: "Sleep Recovery" },
  { key: "daytime_recovery", label: "Daytime Recovery" },
  { key: "stress", label: "Stress" },
];

export default async function RecoveryPage() {
  const [readiness, activity, connected] = await Promise.all([
    getReadinessHistory(30),
    getActivityHistory(30),
    isOuraConnected(),
  ]);

  if (readiness.length === 0) {
    return (
      <div>
        <PageHeader
          title="Readiness"
          subtitle="Readiness, HRV, and cardiovascular trends."
        />
        <Card className="flex flex-col items-start gap-3">
          <span className="body-copy">No readiness data yet.</span>
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

  const readinessScore = latestNonNull(readiness, "score");
  const hrv = latestNonNull(readiness, "hrv_balance");
  const restingHr = latestNonNull(readiness, "resting_heart_rate");
  const resilience = latestNonNull(readiness, "resilience_score");
  const bodyTemp = latestNonNull(readiness, "body_temperature");
  const tempTrend = latestNonNull(readiness, "temperature_trend_deviation");
  const cardioAge = latestNonNull(readiness, "cardiovascular_age");
  const vo2Max = latestNonNull(activity, "vo2_max");

  const contributors = latestRowWith(readiness, "contributors")?.contributors ?? null;
  const contributorItems = READINESS_CONTRIBUTORS.map(({ key, label }) => ({
    label,
    value: contributors?.[key] ?? null,
  }));
  const resilienceData =
    latestRowWith(readiness, "resilience_contributors")?.resilience_contributors ??
    null;
  const resilienceItems = RESILIENCE_CONTRIBUTORS.map(({ key, label }) => ({
    label,
    value: resilienceData?.[key] ?? null,
  }));

  const labels = readiness.map((r) => shortDate(r.date));
  const hrvValues = readiness.map((r) => r.hrv_balance);
  const hrvAvg = rollingAverage(hrvValues, 7);
  const hrvTrend = readiness.map((r, i) => ({
    label: labels[i],
    value: r.hrv_balance,
    avg: hrvAvg[i],
  }));
  const series = (pick: (r: (typeof readiness)[number]) => number | null) =>
    readiness.map((r, i) => ({ label: labels[i], value: pick(r) }));
  const vo2Trend = activity.map((a) => ({
    label: shortDate(a.date),
    value: a.vo2_max,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Readiness"
        subtitle="Score contributors, HRV, and cardiovascular trends."
      />

      {/* Score + contributors */}
      <Card className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
        <ScoreRing value={readinessScore} label="Readiness" accent="recovery" />
        <div className="w-full flex-1">
          <ContributorList items={contributorItems} accent="recovery" />
        </div>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="HRV" value={hrv} unit="ms" accent="recovery" />
        <MetricCard label="Resting HR" value={restingHr} unit="bpm" accent="recovery" />
        <MetricCard
          label="Resilience"
          value={ordinalToResilience(resilience)}
          accent="recovery"
        />
        <MetricCard
          label="VO₂ Max"
          value={vo2Max != null ? Math.round(vo2Max * 10) / 10 : null}
          accent="activity"
        />
      </section>

      <ChartCard
        title="Readiness · 30 Days"
        data={series((r) => r.score)}
        accent="recovery"
        current={readinessScore != null ? String(readinessScore) : null}
      />

      <ChartCard
        title="HRV Trend"
        data={hrvTrend}
        accent="recovery"
        showAvg
        current={hrv != null ? `${hrv} ms` : null}
        caption="Solid: nightly · dashed: 7-day average"
      />

      <ChartCard
        title="Resting Heart Rate"
        data={series((r) => r.resting_heart_rate)}
        accent="recovery"
        current={restingHr != null ? `${restingHr} bpm` : null}
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <ChartCard
          title="Body Temperature Deviation"
          data={series((r) => r.body_temperature)}
          accent="stress"
          current={
            bodyTemp != null ? `${bodyTemp > 0 ? "+" : ""}${bodyTemp} °C` : null
          }
          caption={
            tempTrend != null
              ? `Trend ${tempTrend > 0 ? "+" : ""}${tempTrend} °C`
              : "Deviation from baseline"
          }
        />
        <ChartCard
          title="Cardiovascular Age"
          data={series((r) => r.cardiovascular_age)}
          accent="recovery"
          current={cardioAge != null ? `${cardioAge} yr` : null}
        />
      </section>

      {/* Resilience contributors */}
      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="metric-label">Resilience Contributors</span>
          <span className="text-text-primary text-lg font-medium tracking-tight">
            {ordinalToResilience(resilience) ?? "—"}
          </span>
        </div>
        <ContributorList items={resilienceItems} accent="recovery" />
        <span className="timestamp">1 Limited → 5 Exceptional</span>
      </Card>

      <ChartCard
        title="VO₂ Max"
        data={vo2Trend}
        accent="activity"
        current={vo2Max != null ? String(Math.round(vo2Max * 10) / 10) : null}
      />
    </div>
  );
}
