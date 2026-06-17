"use client";

import { ChartCard } from "@/components/charts/ChartCard";
import { Card } from "@/components/ui/Card";
import type { LiftingDashboard } from "@/types";

function labelCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

export function LiftingStats({ dashboard }: { dashboard: LiftingDashboard }) {
  const chartData = dashboard.volume_by_day.map((d) => ({
    label: d.label,
    value: d.volume_lbs > 0 ? d.volume_lbs : null,
  }));

  const maxMuscleSets = Math.max(1, ...dashboard.muscle_split.map((m) => m.sets));

  return (
    <section className="space-y-4">
      <h3 className="metric-label">Last {dashboard.period_days} days</h3>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="py-3">
          <p className="metric-label">Sessions</p>
          <p className="metric-value text-[color:var(--color-activity)]">
            {dashboard.total_sessions}
          </p>
        </Card>
        <Card className="py-3">
          <p className="metric-label">Sets</p>
          <p className="metric-value text-[color:var(--color-activity)]">
            {dashboard.total_sets}
          </p>
        </Card>
        <Card className="py-3">
          <p className="metric-label">Volume</p>
          <p className="metric-value text-[color:var(--color-activity)]">
            {dashboard.total_volume_lbs.toLocaleString()}
            <span className="text-sm font-normal text-text-muted"> lb</span>
          </p>
        </Card>
        <Card className="py-3">
          <p className="metric-label">Streak</p>
          <p className="metric-value text-[color:var(--color-recovery)]">
            {dashboard.current_streak_days}
            <span className="text-sm font-normal text-text-muted"> d</span>
          </p>
        </Card>
      </div>

      <ChartCard
        title="Training volume"
        data={chartData}
        accent="activity"
        current={
          dashboard.total_volume_lbs > 0
            ? `${dashboard.total_volume_lbs.toLocaleString()} lb`
            : null
        }
        caption="Daily working-set volume (Hevy + Kova)"
        height={140}
      />

      {dashboard.muscle_split.length > 0 ? (
        <Card>
          <p className="metric-label mb-3">Muscle split (sets)</p>
          <ul className="space-y-2">
            {dashboard.muscle_split.map((row) => (
              <li key={row.category}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-text-primary">{labelCategory(row.category)}</span>
                  <span className="text-text-muted tabular-nums">
                    {row.sets} sets · {row.volume_lbs.toLocaleString()} lb
                  </span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                  <div
                    className="h-full rounded-full bg-[color:var(--color-activity)]"
                    style={{ width: `${(row.sets / maxMuscleSets) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
