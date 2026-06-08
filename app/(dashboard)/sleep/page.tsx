import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/charts/ChartCard";
import { StageBars } from "@/components/charts/StageBars";
import {
  getReadinessHistory,
  getSleepHistory,
  isOuraConnected,
} from "@/lib/data/oura";
import { formatDuration, secondsToHours, shortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SleepPage() {
  const [sleep, readiness, connected] = await Promise.all([
    getSleepHistory(30),
    getReadinessHistory(14),
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

  const latest = sleep[sleep.length - 1];
  const scored = sleep.filter((s) => s.score !== null);
  const best = scored.reduce<typeof scored[number] | null>(
    (b, s) => (b === null || (s.score ?? 0) > (b.score ?? 0) ? s : b),
    null,
  );
  const worst = scored.reduce<typeof scored[number] | null>(
    (w, s) => (w === null || (s.score ?? 0) < (w.score ?? 0) ? s : w),
    null,
  );

  const scoreTrend = sleep.slice(-7).map((s) => ({
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
        subtitle="Stages, efficiency, and sleep debt over time."
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Sleep Score" value={latest.score} accent="sleep" />
        <MetricCard
          label="Efficiency"
          value={latest.efficiency}
          unit="%"
          accent="sleep"
        />
        <MetricCard
          label="Latency"
          value={formatDuration(latest.latency)}
          accent="sleep"
        />
        <MetricCard label="Restfulness" value={latest.restfulness} accent="sleep" />
      </section>

      <Card className="space-y-4">
        <div className="flex items-baseline justify-between">
          <span className="metric-label">Last Night · Stages</span>
          <span className="text-text-primary text-lg font-medium tracking-tight">
            {formatDuration(latest.total_sleep_duration)}
          </span>
        </div>
        <StageBars
          rem={latest.rem_sleep_duration}
          deep={latest.deep_sleep_duration}
          light={latest.light_sleep_duration}
          awake={latest.awake_duration}
        />
      </Card>

      <ChartCard
        title="Sleep Score · 7 Days"
        data={scoreTrend}
        accent="sleep"
        current={latest.score != null ? String(latest.score) : null}
      />

      <ChartCard
        title="HRV During Sleep"
        data={hrvTrend}
        accent="recovery"
        current={
          readiness.at(-1)?.hrv_balance != null
            ? `${readiness.at(-1)!.hrv_balance} ms`
            : null
        }
        caption="Nightly average HRV (ms)"
      />

      <ChartCard
        title="Sleep Debt · 14 Days"
        data={debtTrend}
        accent="stress"
        current={
          secondsToHours(latest.sleep_debt_seconds) != null
            ? `${secondsToHours(latest.sleep_debt_seconds)} hrs`
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
