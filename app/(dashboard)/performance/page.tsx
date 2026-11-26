import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ChartCard } from "@/components/charts/ChartCard";
import { LazyFitnessChart, LazyStackedWeeks } from "@/components/charts/lazyCharts";
import { TodayCard } from "@/components/performance/TodayCard";
import { Card } from "@/components/ui/Card";
import { getPerformance } from "@/lib/data/performance";
import { formatRaceTime } from "@/lib/performance";
import { formatIsoDateLabel, shortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Zones are data — cool → hot. */
const ZONE_COLORS = ["var(--color-sleep)", "var(--color-recovery)", "var(--color-activity)", "var(--color-nutrition)", "var(--color-stress)"];

const pace = (minPerMile: number) => {
  const total = Math.round(minPerMile * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const SPORTS = [
  { key: "run", label: "Run", color: "var(--color-activity)" },
  { key: "ride", label: "Ride", color: "var(--color-sleep)" },
  { key: "lift", label: "Lift", color: "var(--color-strength)" },
];

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="text-text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-2 rounded-sm" style={{ background: i.color }} /> {i.label}
        </span>
      ))}
    </div>
  );
}

function ratioNote(ratio: number | null): string {
  if (ratio == null) return "Building history";
  if (ratio > 1.5) return "Ramping too fast";
  if (ratio > 1.2) return "Building";
  if (ratio >= 0.8) return "Steady";
  return "Detraining";
}

/** Performance — Recovery & Strain, fitness / fatigue / form, zones, predictions. */
export default async function PerformancePage() {
  const p = await getPerformance(90);
  const fitnessData = p.fitness.map((f) => ({ label: shortDate(f.date), fitness: f.fitness, fatigue: f.fatigue, form: f.form }));
  const last4 = p.weeklyZones.slice(-4);
  const zoneTotals = [0, 1, 2, 3, 4].map((i) => last4.reduce((s, w) => s + (w.zones[i] ?? 0), 0));
  const zoneSum = zoneTotals.reduce((a, b) => a + b, 0);
  const easyPct = zoneSum ? Math.round(((zoneTotals[0]! + zoneTotals[1]!) / zoneSum) * 100) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Performance" subtitle="Recovery, strain, fitness and what your training is building." />

      <TodayCard data={p} detailed />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="metric-label">Fitness · Fatigue · Form</span>
          {p.current ? (
            <span className="text-text-secondary text-xs tabular-nums">
              Fitness {Math.round(p.current.fitness)} · Fatigue {Math.round(p.current.fatigue)} · Form{" "}
              {p.current.form >= 0 ? "+" : ""}
              {Math.round(p.current.form)} · Ratio {p.current.ratio ?? "—"} ({ratioNote(p.current.ratio)})
            </span>
          ) : null}
        </div>
        <LazyFitnessChart data={fitnessData} />
        <div className="text-text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: "var(--color-recovery)" }} /> Fitness
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded" style={{ background: "var(--color-stress)" }} /> Fatigue
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm opacity-60" style={{ background: "var(--color-activity)" }} /> Form
          </span>
        </div>
        <p className="text-text-muted text-xs">
          Fitness is your 42-day training load, fatigue the last 7 days, form the gap between them (positive = fresh).
          Load comes from Garmin&apos;s training load; sessions it didn&apos;t record are estimated from duration
          {p.estimatedDays ? ` (${p.estimatedDays} days include an estimate)` : ""}. A ratio above 1.5 is a common
          injury-risk line.
        </p>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Recovery · 30 Days"
          data={p.recoveryHistory.map((r) => ({ label: shortDate(r.date), value: r.score }))}
          accent="recovery"
          current={p.recovery.score != null ? String(p.recovery.score) : null}
        />
        <ChartCard
          title="Strain · 30 Days"
          data={p.recoveryHistory.map((r) => ({ label: shortDate(r.date), value: r.strain }))}
          accent="activity"
          current={p.strain.score.toFixed(1)}
          caption="0–21 from the day's training load"
        />
      </section>

      <Card className="space-y-3">
        <span className="metric-label">Weekly load by sport</span>
        <LazyStackedWeeks
          data={p.weeklyLoad.map((w) => ({ label: shortDate(w.week), run: Math.round(w.run), ride: Math.round(w.ride), lift: Math.round(w.lift) }))}
          series={SPORTS}
        />
        <Legend items={SPORTS} />
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="metric-label">Time in heart-rate zones</span>
          {easyPct != null ? (
            <span className="text-text-secondary text-xs tabular-nums">
              Last 4 weeks: {easyPct}% easy (Z1–2) · target ~80%
            </span>
          ) : null}
        </div>
        <LazyStackedWeeks
          data={p.weeklyZones.map((w) => ({ label: shortDate(w.week), ...Object.fromEntries(w.zones.map((z, i) => [`z${i + 1}`, z])) }))}
          series={ZONE_COLORS.map((color, i) => ({ key: `z${i + 1}`, label: `Zone ${i + 1}`, color }))}
        />
        <Legend items={ZONE_COLORS.map((color, i) => ({ label: `Z${i + 1}`, color }))} />
        {p.hrZones ? (
          <p className="text-text-muted text-xs tabular-nums">
            Garmin zones: Z1 {p.hrZones.floors[0]}+ · Z2 {p.hrZones.floors[1]}+ · Z3 {p.hrZones.floors[2]}+ · Z4 {p.hrZones.floors[3]}+ · Z5{" "}
            {p.hrZones.floors[4]}+ bpm{p.hrZones.max_hr ? ` · max ${p.hrZones.max_hr}` : ""}
            {p.hrZones.lactate_threshold_hr ? ` · threshold ${p.hrZones.lactate_threshold_hr}` : ""}
          </p>
        ) : null}
      </Card>

      <Card className="space-y-3">
        <span className="metric-label">Race predictions</span>
        {p.predictions.basis ? (
          <>
            <ul className="divide-border divide-y">
              {p.predictions.predictions.map((r) => (
                <li key={r.key} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                  <span className={r.key === p.predictions.raceKey ? "font-semibold" : "text-text-secondary"}>{r.label}</span>
                  <span className="tabular-nums" style={{ color: "var(--color-activity)" }}>
                    {formatRaceTime(r.minutes)}
                    <span className="text-text-muted ml-2 text-xs">{pace(r.minutes / (r.km / 1.609344))}/mi</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-text-muted text-xs">
              From your {p.predictions.basis.label} on {formatIsoDateLabel(p.predictions.basis.date)} (
              {(p.predictions.basis.distance_km / 1.609344).toFixed(1)} mi in {formatRaceTime(p.predictions.basis.time_min)}).
              Run/walk efforts include walk breaks, so these will drop fast once you&apos;re running continuously —
              your 5K test will reset them.
            </p>
          </>
        ) : (
          <p className="body-copy text-sm">Log a run with distance to get predictions.</p>
        )}
      </Card>

      {p.paceZones ? (
        <Card className="space-y-3">
          <span className="metric-label">Pace zones (estimated)</span>
          <ul className="space-y-1.5">
            {p.paceZones.map((z) => (
              <li key={z.key} className="flex items-baseline justify-between gap-3 text-sm">
                <span>
                  {z.label} <span className="text-text-muted text-xs">· {z.use}</span>
                </span>
                <span className="tabular-nums">
                  {pace(z.min_per_mile[0])}–{pace(z.min_per_mile[1])}/mi
                </span>
              </li>
            ))}
          </ul>
          <p className="text-text-muted text-xs">From the predicted 5K. While you&apos;re on run/walk, go by heart rate (Z2) for easy runs.</p>
        </Card>
      ) : null}

      {p.vo2max.length > 0 ? (
        <ChartCard
          title="VO₂ Max"
          data={p.vo2max.map((v) => ({ label: shortDate(v.date), value: v.value }))}
          accent="activity"
          current={String(p.vo2max.at(-1)!.value)}
        />
      ) : (
        <p className="text-text-muted text-xs">
          VO₂ max appears once Garmin estimates it (outdoor runs with GPS and heart rate). See also{" "}
          <Link href="/injuries" className="underline">
            Injuries
          </Link>
          .
        </p>
      )}
    </div>
  );
}
