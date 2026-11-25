import Link from "next/link";
import { ScoreRing } from "@/components/charts/ScoreRing";
import type { PerformanceData } from "@/lib/data/performance";

/** Advice level is data (a training call), so the dot uses semantic accents. */
const LEVEL_COLOR = {
  go: "var(--color-recovery)",
  easy: "var(--color-activity)",
  rest: "var(--color-stress)",
} as const;

/** Recovery + Strain + today's call. `detailed` adds the score breakdown (Performance page). */
export function TodayCard({ data, detailed = false }: { data: PerformanceData; detailed?: boolean }) {
  const { recovery, strain, advice } = data;
  const body = (
    <div className="dash-card space-y-4" style={{ padding: 16 }}>
      <div className="flex items-center gap-4">
        <ScoreRing value={recovery.score} accent="recovery" size={84} />
        <div className="min-w-0 flex-1 space-y-1">
          <span className="metric-label">Recovery · {recovery.label}</span>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className="size-2 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[advice.level] }} aria-hidden />
            {advice.headline}
          </p>
          <p className="text-text-secondary text-xs">{advice.detail}</p>
        </div>
        <div className="shrink-0 text-right">
          <span className="metric-label">Strain</span>
          <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-activity)" }}>
            {strain.score.toFixed(1)}
          </p>
          <p className="text-text-muted text-xs">{strain.label}</p>
        </div>
      </div>

      {detailed ? (
        <ul className="space-y-2">
          {recovery.components.map((c) => (
            <li key={c.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="text-text-secondary">
                  {c.label} <span className="text-text-muted">· {Math.round(c.weight * 100)}%</span>
                </span>
                <span className="text-text-muted tabular-nums">{c.detail}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                <div className="h-full rounded-full" style={{ width: `${Math.round(c.score)}%`, background: "var(--color-recovery)" }} />
              </div>
            </li>
          ))}
          {recovery.injury.points > 0 ? (
            <li className="text-xs" style={{ color: "var(--color-stress)" }}>
              Injury: {recovery.injury.reason} (−{recovery.injury.points})
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
  return detailed ? body : (
    <Link href="/performance" className="snapshot-link-card block" style={{ marginBottom: 10 }}>
      {body}
    </Link>
  );
}
