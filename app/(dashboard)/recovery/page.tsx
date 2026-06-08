import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/charts/ChartCard";
import {
  getActivityHistory,
  getReadinessHistory,
  isOuraConnected,
} from "@/lib/data/oura";
import { ordinalToResilience } from "@/lib/oura";
import { rollingAverage, shortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

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
          title="Recovery"
          subtitle="Readiness, HRV, and cardiovascular trends."
        />
        <Card className="flex flex-col items-start gap-3">
          <span className="body-copy">No recovery data yet.</span>
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

  const latest = readiness[readiness.length - 1];
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
        title="Recovery"
        subtitle="Readiness, HRV, and cardiovascular trends."
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Readiness" value={latest.score} accent="recovery" />
        <MetricCard label="HRV" value={latest.hrv_balance} unit="ms" accent="recovery" />
        <MetricCard
          label="Resting HR"
          value={latest.resting_heart_rate}
          unit="bpm"
          accent="recovery"
        />
        <MetricCard
          label="Resilience"
          value={ordinalToResilience(latest.resilience_score)}
          accent="recovery"
        />
      </section>

      <ChartCard
        title="Readiness · 30 Days"
        data={series((r) => r.score)}
        accent="recovery"
        current={latest.score != null ? String(latest.score) : null}
      />

      <ChartCard
        title="HRV Trend"
        data={hrvTrend}
        accent="recovery"
        showAvg
        current={latest.hrv_balance != null ? `${latest.hrv_balance} ms` : null}
        caption="Solid: nightly · dashed: 7-day average"
      />

      <ChartCard
        title="Resting Heart Rate"
        data={series((r) => r.resting_heart_rate)}
        accent="recovery"
        current={
          latest.resting_heart_rate != null
            ? `${latest.resting_heart_rate} bpm`
            : null
        }
      />

      <ChartCard
        title="Body Temperature Deviation"
        data={series((r) => r.body_temperature)}
        accent="stress"
        current={
          latest.body_temperature != null
            ? `${latest.body_temperature > 0 ? "+" : ""}${latest.body_temperature} °C`
            : null
        }
        caption="Deviation from baseline"
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <ChartCard
          title="Cardiovascular Age"
          data={series((r) => r.cardiovascular_age)}
          accent="recovery"
          current={
            latest.cardiovascular_age != null
              ? `${latest.cardiovascular_age} yr`
              : null
          }
        />
        <ChartCard
          title="Resilience"
          data={series((r) => r.resilience_score)}
          accent="recovery"
          current={ordinalToResilience(latest.resilience_score)}
          caption="1 Limited → 5 Exceptional"
        />
      </section>

      <ChartCard
        title="VO₂ Max"
        data={vo2Trend}
        accent="activity"
        current={
          [...activity].reverse().find((a) => a.vo2_max != null)?.vo2_max?.toString() ??
          null
        }
      />
    </div>
  );
}
