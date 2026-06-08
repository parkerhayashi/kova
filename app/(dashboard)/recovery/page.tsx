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
import { latestNonNull, rollingAverage, shortDate } from "@/lib/utils";

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

  // Current-day readiness lands before HRV / resting HR / body temp are
  // finalized, so each headline uses the most recent populated value.
  const readinessScore = latestNonNull(readiness, "score");
  const hrv = latestNonNull(readiness, "hrv_balance");
  const restingHr = latestNonNull(readiness, "resting_heart_rate");
  const resilience = latestNonNull(readiness, "resilience_score");
  const bodyTemp = latestNonNull(readiness, "body_temperature");
  const cardioAge = latestNonNull(readiness, "cardiovascular_age");
  const vo2Max = latestNonNull(activity, "vo2_max");
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
        <MetricCard label="Readiness" value={readinessScore} accent="recovery" />
        <MetricCard label="HRV" value={hrv} unit="ms" accent="recovery" />
        <MetricCard
          label="Resting HR"
          value={restingHr}
          unit="bpm"
          accent="recovery"
        />
        <MetricCard
          label="Resilience"
          value={ordinalToResilience(resilience)}
          accent="recovery"
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

      <ChartCard
        title="Body Temperature Deviation"
        data={series((r) => r.body_temperature)}
        accent="stress"
        current={
          bodyTemp != null ? `${bodyTemp > 0 ? "+" : ""}${bodyTemp} °C` : null
        }
        caption="Deviation from baseline"
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <ChartCard
          title="Cardiovascular Age"
          data={series((r) => r.cardiovascular_age)}
          accent="recovery"
          current={cardioAge != null ? `${cardioAge} yr` : null}
        />
        <ChartCard
          title="Resilience"
          data={series((r) => r.resilience_score)}
          accent="recovery"
          current={ordinalToResilience(resilience)}
          caption="1 Limited → 5 Exceptional"
        />
      </section>

      <ChartCard
        title="VO₂ Max"
        data={vo2Trend}
        accent="activity"
        current={vo2Max != null ? String(vo2Max) : null}
      />
    </div>
  );
}
