import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/charts/ChartCard";
import { DualTrendCard } from "@/components/trends/DualTrendCard";
import {
  MICRONUTRIENT_RDA,
  progressPct,
  type DailyTotals,
} from "@/lib/nutrition";
import { shortDate } from "@/lib/utils";
import type { DualTrendView } from "@/lib/trends/types";

export function CalorieTrend({
  trend,
}: {
  trend: { date: string; calories: number; goal: number }[];
}) {
  const todayGoal = trend[trend.length - 1]?.goal ?? null;
  const data = trend.map((d) => ({
    label: shortDate(d.date),
    value: d.calories > 0 ? d.calories : null,
    avg: d.goal > 0 ? d.goal : null,
  }));

  return (
    <ChartCard
      title="Calories · 7 days"
      data={data}
      accent="nutrition"
      showAvg
      current={todayGoal ? `${todayGoal} today` : null}
      caption="Dashed line = daily goal (TDEE + intake/weight nudge + weight/body fat targets)"
    />
  );
}

export function NutritionWeightTrends({ views }: { views: DualTrendView[] }) {
  if (views.length === 0) return null;

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      {views.map((view) => (
        <DualTrendCard key={view.id} view={view} />
      ))}
    </section>
  );
}

export function MicroProgress({ totals }: { totals: DailyTotals }) {
  return (
    <Card className="space-y-4">
      <span className="metric-label">Micronutrients vs. daily targets</span>
      <ul className="space-y-3">
        {MICRONUTRIENT_RDA.map((rda) => {
          const current = totals[rda.key] ?? 0;
          const pct = progressPct(current, rda.target);
          const over = rda.limit && current > rda.target;
          const color = over
            ? "var(--color-stress)"
            : pct >= 80
              ? "var(--color-recovery)"
              : "var(--color-nutrition)";

          return (
            <li key={rda.key} className="space-y-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className="text-text-secondary">{rda.label}</span>
                <span className="text-text-muted tabular-nums">
                  {current > 0 ? Math.round(current * 10) / 10 : "—"}
                  {current > 0 ? rda.unit : ""} / {rda.target}
                  {rda.unit}
                </span>
              </div>
              <div className="bg-surface-raised h-1.5 overflow-hidden rounded-full">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, pct)}%`,
                    background: current > 0 ? color : "rgba(255,255,255,0.08)",
                  }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
