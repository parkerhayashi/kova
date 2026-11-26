import { LazyScatterChart as ScatterChart } from "@/components/charts/lazyCharts";
import { Card } from "@/components/ui/Card";
import type { Insight } from "@/lib/insights";
import type { Accent } from "@/lib/utils";

/** Status is data: on track green, worth a look red, building grey. */
const STATUS: Record<Insight["status"], { color: string; label: string }> = {
  ok: { color: "var(--color-recovery)", label: "On track" },
  warning: { color: "var(--color-stress)", label: "Worth a look" },
  needs_data: { color: "var(--color-text-muted)", label: "Building" },
};

const ACCENTS: Record<string, [Accent, Accent]> = {
  "carbs-efficiency": ["nutrition", "activity"],
  "deficit-hrv": ["nutrition", "recovery"],
  "deficit-rhr": ["nutrition", "stress"],
  "protein-recovery": ["nutrition", "recovery"],
};

export function InsightCard({ insight }: { insight: Insight }) {
  const s = STATUS[insight.status];
  const [xAccent, yAccent] = ACCENTS[insight.id] ?? ["nutrition", "recovery"];
  const showScatter = insight.points && insight.points.length >= 3 && insight.status !== "needs_data";
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <span className="metric-label">{insight.title}</span>
        <span className="text-text-muted flex shrink-0 items-center gap-1.5 text-xs">
          <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
          {s.label}
        </span>
      </div>
      <p className="text-text-primary text-sm">{insight.finding}</p>
      {showScatter ? (
        <ScatterChart points={insight.points!} xLabel={insight.xLabel ?? ""} yLabel={insight.yLabel ?? ""} xAccent={xAccent} yAccent={yAccent} height={180} />
      ) : null}
      {insight.rows?.length ? (
        <ul className="space-y-1">
          {insight.rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-text-secondary">{r.label}</span>
              <span className="tabular-nums" style={r.ok ? undefined : { color: "var(--color-stress)" }}>
                {r.value}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-text-muted text-xs">{insight.detail}</p>
    </Card>
  );
}
