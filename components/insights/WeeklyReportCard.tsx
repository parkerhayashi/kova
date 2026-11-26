import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { WeeklyReport } from "@/lib/insights";
import { addDays, formatIsoDateLabel } from "@/lib/utils";

const SPORT_LABEL = { run: "Runs", lift: "Lifts", ride: "Rides" } as const;

function delta(now: number | null, prev: number | null, unit = "", tone: "higher-better" | "lower-better" | "neutral" = "higher-better", vs = "last week") {
  if (now == null || prev == null) return null;
  const d = Math.round((now - prev) * 10) / 10;
  if (d === 0) return <span className="text-text-muted">same as {vs}</span>;
  const good = tone === "lower-better" ? d < 0 : d > 0;
  return (
    <span className={tone === "neutral" ? "text-text-muted" : undefined} style={tone === "neutral" ? undefined : { color: good ? "var(--color-recovery)" : "var(--color-stress)" }}>
      {d > 0 ? "+" : ""}
      {d}
      {unit} vs {vs}
    </span>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: React.ReactNode; accent?: string }) {
  return (
    <div className="space-y-0.5">
      <span className="metric-label">{label}</span>
      <p className="text-lg font-semibold tabular-nums" style={accent ? { color: accent } : undefined}>
        {value}
      </p>
      {sub ? <p className="text-xs">{sub}</p> : null}
    </div>
  );
}

/** One week at a glance: compliance, load, fitness, Recovery, nutrition, running. */
export function WeeklyReportCard({ report, thisWeek, basePath = "/insights" }: { report: WeeklyReport; thisWeek: string; basePath?: string }) {
  const r = report;
  const n = r.nutrition;
  const end = addDays(r.week, 6);
  const isCurrent = r.week === thisWeek;
  return (
    <Card className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <span className="metric-label">{isCurrent ? "This week" : r.week === addDays(thisWeek, -7) ? "Last week" : "Week"}</span>
          <p className="text-text-primary mt-1 font-semibold">
            {formatIsoDateLabel(r.week, { month: "short", day: "numeric" })} – {formatIsoDateLabel(end, { month: "short", day: "numeric" })}
            {r.complete ? "" : ` · ${r.days} of 7 days`}
          </p>
        </div>
        <div className="flex gap-1">
          <Link href={`${basePath}?week=${addDays(r.week, -7)}`} className="border-border hover:bg-[rgba(255,255,255,0.07)] rounded-lg border p-1.5" aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Link>
          {!isCurrent ? (
            <Link href={`${basePath}?week=${addDays(r.week, 7)}`} className="border-border hover:bg-[rgba(255,255,255,0.07)] rounded-lg border p-1.5" aria-label="Next week">
              <ChevronRight className="size-4" />
            </Link>
          ) : null}
        </div>
      </div>

      {r.highlights.length ? (
        <ul className="space-y-1.5">
          {r.highlights.map((h) => (
            <li key={h} className="text-text-secondary flex gap-2 text-sm">
              <span className="text-text-muted">•</span>
              {h}
            </li>
          ))}
        </ul>
      ) : null}

      {r.compliance?.length ? (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {r.compliance.map((c) => (
            <Stat key={c.sport} label={SPORT_LABEL[c.sport]} value={`${c.done} / ${c.planned}`} sub={<span className="text-text-muted">planned sessions done</span>} />
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Load" value={String(r.load.total)} sub={delta(r.load.total, r.load.prev, "", "neutral", r.complete ? "last week" : "same days last week")} accent="var(--color-activity)" />
        <Stat
          label="Fitness"
          value={r.fitness.end != null ? String(r.fitness.end) : "—"}
          sub={r.fitness.start != null && r.fitness.end != null ? <span className="text-text-muted">from {r.fitness.start} · form {r.fitness.form}</span> : undefined}
          accent="var(--color-activity)"
        />
        <Stat label="Recovery" value={r.recovery.avg != null ? String(r.recovery.avg) : "—"} sub={delta(r.recovery.avg, r.recovery.prev)} accent="var(--color-recovery)" />
        <Stat label="Sleep" value={r.sleep.avg != null ? String(r.sleep.avg) : "—"} sub={<span className="text-text-muted">avg score</span>} accent="var(--color-sleep)" />
        <Stat label="HRV" value={r.hrv.avg != null ? `${r.hrv.avg} ms` : "—"} sub={delta(r.hrv.avg, r.hrv.prev, " ms")} accent="var(--color-recovery)" />
        <Stat label="Resting HR" value={r.rhr.avg != null ? `${r.rhr.avg}` : "—"} sub={delta(r.rhr.avg, r.rhr.prev, " bpm", "lower-better")} accent="var(--color-stress)" />
        <Stat
          label="Running"
          value={`${r.running.runs} · ${Math.round((r.running.km / 1.609344) * 10) / 10} mi`}
          sub={<span className="text-text-muted">{r.running.minutes} min{r.running.easy_pct != null ? ` · ${r.running.easy_pct}% easy` : ""}</span>}
          accent="var(--color-activity)"
        />
        <Stat
          label="Nutrition"
          value={n.avg_calories != null ? `${n.avg_calories} kcal` : "—"}
          sub={
            <span className="text-text-muted">
              {n.days_logged}/{r.days} days logged
              {n.avg_protein != null ? ` · ${n.avg_protein} g protein` : ""}
              {n.calorie_target ? ` · target ${n.calorie_target}` : ""}
            </span>
          }
          accent="var(--color-nutrition)"
        />
      </div>
    </Card>
  );
}
