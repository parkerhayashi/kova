import Link from "next/link";
import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { CorrelationCard } from "@/components/trends/CorrelationCard";
import { DualTrendCard } from "@/components/trends/DualTrendCard";
import { RangeSelector } from "@/components/trends/RangeSelector";
import { getTrendsPayload, parseTrendRange } from "@/lib/data/trends";
import { describeCorrelation, formatR } from "@/lib/trends/correlation";
import { formatPace } from "@/lib/trends/running";
import { shortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days: daysParam } = await searchParams;
  const range = parseTrendRange(daysParam);
  const payload = await getTrendsPayload(range);

  const { running } = payload;
  const ranked = [...payload.correlations, ...running.correlations]
    .filter((c) => c.r !== null && c.points.length >= c.minPairs)
    .sort((a, b) => Math.abs(b.r ?? 0) - Math.abs(a.r ?? 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Trends & Correlations"
          subtitle="Cross-source views no single app can show."
        />
        <Suspense fallback={null}>
          <RangeSelector active={range} />
        </Suspense>
      </div>

      {!payload.ouraConnected && (
        <Card className="flex flex-col items-start gap-3">
          <span className="body-copy text-sm">
            Most correlations need Oura data. Connect your ring to unlock sleep,
            readiness, and stress views.
          </span>
          <Link
            href="/api/auth/oura"
            className="border-border-strong hover:bg-surface-raised inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm transition-colors"
          >
            Connect Oura
          </Link>
        </Card>
      )}

      {ranked.length > 0 && (
        <Card className="space-y-3">
          <span className="metric-label">Strongest signals · {range} days</span>
          <ul className="space-y-2">
            {ranked.slice(0, 4).map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-text-secondary">{c.title}</span>
                <span className="text-text-primary font-medium tabular-nums">
                  {formatR(c.r)}{" "}
                  <span className="text-text-muted font-normal">
                    ({describeCorrelation(c.r)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="space-y-4">
        <span className="section-eyebrow">Running</span>
        <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <RunStat label="Miles" value={running.summary.miles.toString()} />
          <RunStat label="Runs" value={running.summary.runs.toString()} />
          <RunStat
            label="Avg pace"
            value={running.summary.avg_pace_min_per_mile != null
              ? formatPace(running.summary.avg_pace_min_per_mile).replace(" /mi", "")
              : "—"}
            unit={running.summary.avg_pace_min_per_mile != null ? "/mi" : undefined}
          />
          <RunStat
            label="Longest"
            value={running.summary.longest_miles?.toString() ?? "—"}
            unit={running.summary.longest_miles != null ? "mi" : undefined}
            caption={running.summary.longest_date ? shortDate(running.summary.longest_date) : undefined}
          />
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          {running.trends.map((view) => (
            <DualTrendCard key={view.id} view={view} />
          ))}
          {running.correlations.map((view) => (
            <CorrelationCard key={view.id} view={view} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {payload.correlations.map((view) => (
          <CorrelationCard key={view.id} view={view} />
        ))}
      </section>

      {payload.dualTrends.length > 0 && (
        <section className="grid gap-4 lg:grid-cols-2">
          {payload.dualTrends.map((view) => (
            <DualTrendCard key={view.id} view={view} />
          ))}
        </section>
      )}

      {payload.comingSoon.length > 0 && (
        <Card className="space-y-3">
          <span className="metric-label">Coming with future integrations</span>
          <ul className="space-y-2">
            {payload.comingSoon.map((item) => (
              <li key={item.title} className="body-copy text-sm">
                <span className="text-text-primary">{item.title}</span>
                <span className="text-text-muted"> — {item.reason}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function RunStat({
  label,
  value,
  unit,
  caption,
}: {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
}) {
  return (
    <div className="space-y-1">
      <span className="metric-label">{label}</span>
      <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-activity)" }}>
        {value}
        {unit ? <span className="text-text-muted ml-1 text-sm font-normal">{unit}</span> : null}
      </p>
      {caption ? <span className="timestamp">{caption}</span> : null}
    </div>
  );
}
