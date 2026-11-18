import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { ChartCard } from "@/components/charts/ChartCard";
import { ScoreRing } from "@/components/charts/ScoreRing";
import { getGarminDailyFor, getGarminDailyHistory } from "@/lib/data/garmin";
import { getReadinessHistory, getTimezone } from "@/lib/data/oura";
import { latestNonNull, latestRowWith, rollingAverage, shortDate, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Garmin HRV status → plain words. */
const HRV_STATUS: Record<string, string> = {
  BALANCED: "Balanced",
  UNBALANCED: "Unbalanced",
  LOW: "Low",
  POOR: "Poor",
  NONE: "Baseline forming",
};

const titleCase = (s: string | null) =>
  s ? s.toLowerCase().replaceAll("_", " ").replace(/^\w/, (c) => c.toUpperCase()) : null;

/** Body Battery & HRV — Garmin's recovery stats. Oura readiness history sits below. */
export default async function RecoveryPage() {
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const [garmin, todayRow, ouraReadiness] = await Promise.all([
    getGarminDailyHistory(30),
    getGarminDailyFor(today),
    getReadinessHistory(90),
  ]);

  const latest = todayRow ?? latestRowWith(garmin, "body_battery_latest");
  const hrvRow = latestRowWith(garmin, "hrv_last_night_ms");
  const restingHr = latestNonNull(garmin, "resting_hr");
  const stressAvg = latestNonNull(garmin, "stress_avg");

  const labels = garmin.map((r) => shortDate(r.date));
  const series = (pick: (r: (typeof garmin)[number]) => number | null) =>
    garmin.map((r, i) => ({ label: labels[i]!, value: pick(r) }));
  const hrvValues = garmin.map((r) => r.hrv_last_night_ms);
  const hrvAvg = rollingAverage(hrvValues, 7);

  const time = (ms: number) =>
    new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: timezone });
  const curve = (todayRow?.body_battery_curve ?? []).map(([ms, level]) => ({ label: time(ms), value: level }));

  const ouraRows = ouraReadiness.filter((r) => r.score != null);

  return (
    <div className="space-y-6">
      <PageHeader title="Body Battery & HRV" subtitle="Garmin's energy, HRV and heart-rate trends." />

      {garmin.length === 0 ? (
        <Card>
          <p className="body-copy text-sm">
            No Garmin recovery data yet — wear the watch overnight and it shows up after the next sync.
          </p>
        </Card>
      ) : (
        <>
          <Card className="flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
            <ScoreRing value={latest?.body_battery_latest != null ? Math.round(latest.body_battery_latest) : null} label="Body Battery" accent="recovery" />
            <div className="grid w-full flex-1 grid-cols-2 gap-4">
              <div>
                <span className="metric-label">Woke at</span>
                <p className="text-text-primary text-lg font-semibold tabular-nums">
                  {latest?.body_battery_max != null ? Math.round(latest.body_battery_max) : "—"}
                </p>
              </div>
              <div>
                <span className="metric-label">Low</span>
                <p className="text-text-primary text-lg font-semibold tabular-nums">
                  {latest?.body_battery_min != null ? Math.round(latest.body_battery_min) : "—"}
                </p>
              </div>
              <div>
                <span className="metric-label">Charged</span>
                <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-recovery)" }}>
                  {latest?.body_battery_charged != null ? `+${Math.round(latest.body_battery_charged)}` : "—"}
                </p>
              </div>
              <div>
                <span className="metric-label">Drained</span>
                <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--color-stress)" }}>
                  {latest?.body_battery_drained != null ? `−${Math.round(latest.body_battery_drained)}` : "—"}
                </p>
              </div>
            </div>
          </Card>

          {curve.length > 1 ? (
            <ChartCard
              title="Body Battery · Today"
              data={curve}
              accent="recovery"
              current={curve.at(-1)?.value != null ? String(curve.at(-1)!.value) : null}
            />
          ) : null}

          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricCard
              label="HRV last night"
              value={hrvRow?.hrv_last_night_ms != null ? Math.round(hrvRow.hrv_last_night_ms) : null}
              unit="ms"
              accent="recovery"
              caption={hrvRow?.hrv_status ? HRV_STATUS[hrvRow.hrv_status] ?? titleCase(hrvRow.hrv_status) ?? undefined : undefined}
            />
            <MetricCard
              label="HRV 7-day avg"
              value={hrvRow?.hrv_weekly_avg_ms != null ? Math.round(hrvRow.hrv_weekly_avg_ms) : null}
              unit="ms"
              accent="recovery"
              caption={
                hrvRow?.hrv_baseline_low_ms != null && hrvRow.hrv_baseline_high_ms != null
                  ? `Baseline ${Math.round(hrvRow.hrv_baseline_low_ms)}–${Math.round(hrvRow.hrv_baseline_high_ms)} ms`
                  : "Baseline forms after ~3 weeks"
              }
            />
            <MetricCard label="Resting HR" value={restingHr != null ? Math.round(restingHr) : null} unit="bpm" accent="recovery" />
            <MetricCard
              label="Stress"
              value={stressAvg != null ? Math.round(stressAvg) : null}
              accent="stress"
              caption={titleCase(latestRowWith(garmin, "stress_qualifier")?.stress_qualifier ?? null) ?? "Avg level, 0–100"}
            />
          </section>
          {hrvRow?.hrv_feedback ? (
            <p className="text-text-muted -mt-3 text-xs">{titleCase(hrvRow.hrv_feedback)}</p>
          ) : null}

          <ChartCard
            title="Morning Body Battery · 30 Days"
            data={series((r) => r.body_battery_max)}
            accent="recovery"
            current={latest?.body_battery_max != null ? String(Math.round(latest.body_battery_max)) : null}
            caption="Body Battery when you woke up"
          />

          <ChartCard
            title="Overnight HRV"
            data={garmin.map((r, i) => ({ label: labels[i]!, value: r.hrv_last_night_ms, avg: hrvAvg[i] }))}
            accent="recovery"
            showAvg
            current={hrvRow?.hrv_last_night_ms != null ? `${Math.round(hrvRow.hrv_last_night_ms)} ms` : null}
            caption="Solid: nightly · dashed: 7-day average"
          />

          <ChartCard
            title="Resting Heart Rate"
            data={series((r) => r.resting_hr)}
            accent="recovery"
            current={restingHr != null ? `${Math.round(restingHr)} bpm` : null}
          />

          <ChartCard
            title="Stress"
            data={series((r) => r.stress_avg)}
            accent="stress"
            current={stressAvg != null ? String(Math.round(stressAvg)) : null}
            caption="Daily average stress level (0–100)"
          />
        </>
      )}

      {ouraRows.length > 0 ? (
        <details className="card group">
          <summary className="text-text-secondary hover:text-text-primary cursor-pointer text-sm">
            Oura history (readiness until {shortDate(ouraRows.at(-1)!.date)})
          </summary>
          <div className="mt-4 space-y-4">
            <ChartCard
              title="Oura readiness"
              data={ouraRows.map((r) => ({ label: shortDate(r.date), value: r.score }))}
              accent="recovery"
            />
            <ChartCard
              title="Oura HRV balance"
              data={ouraRows.map((r) => ({ label: shortDate(r.date), value: r.hrv_balance }))}
              accent="recovery"
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}
