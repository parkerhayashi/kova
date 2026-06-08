import Link from "next/link";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import {
  getLatestActivity,
  getLatestReadiness,
  getLatestSleep,
  isOuraConnected,
} from "@/lib/data/oura";
import { ordinalToResilience } from "@/lib/oura";
import { secondsToHours, shortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

function signed(value: number | null): string | null {
  if (value === null) return null;
  return value > 0 ? `+${value}` : `${value}`;
}

/**
 * Today — daily at-a-glance summary (blueprint §7). Oura recovery metrics are
 * live as of Phase 2; nutrition, habits, supplements, weight, and workouts
 * land in later phases.
 */
export default async function TodayPage() {
  const [sleep, readiness, activity, connected] = await Promise.all([
    getLatestSleep(),
    getLatestReadiness(),
    getLatestActivity(),
    isOuraConnected(),
  ]);

  const hasOuraData = Boolean(sleep || readiness || activity);
  const lastSync = readiness?.date ?? sleep?.date ?? activity?.date ?? null;

  return (
    <div className="space-y-8">
      <header className="mb-2 flex items-end justify-between gap-4">
        <div>
          <p className="metric-label">Today</p>
          <h1 className="section-heading mt-1">{today}</h1>
        </div>
        {lastSync ? (
          <span className="timestamp">Oura synced {shortDate(lastSync)}</span>
        ) : null}
      </header>

      {!connected && (
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <span className="metric-label">Oura</span>
            <span className="body-copy">
              Connect your Oura Ring to populate recovery, sleep, and activity.
            </span>
          </div>
          <Link
            href="/api/auth/oura"
            className="border-border-strong hover:bg-surface-raised inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm transition-colors"
          >
            Connect Oura
          </Link>
        </Card>
      )}

      {connected && !hasOuraData && (
        <Card>
          <span className="body-copy">
            Oura is connected. Waiting for the first sync — data appears here
            once it completes.
          </span>
        </Card>
      )}

      {/* Primary recovery readouts */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard label="Readiness" value={readiness?.score ?? null} accent="recovery" />
        <MetricCard label="Sleep Score" value={sleep?.score ?? null} accent="sleep" />
        <MetricCard
          label="HRV"
          value={readiness?.hrv_balance ?? null}
          unit="ms"
          accent="recovery"
        />
      </section>

      {/* Secondary recovery metrics */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Stress"
          value={activity?.stress_score ?? null}
          unit="min"
          accent="stress"
        />
        <MetricCard
          label="Cardio Age"
          value={readiness?.cardiovascular_age ?? null}
          unit="yr"
          accent="recovery"
        />
        <MetricCard
          label="Resilience"
          value={ordinalToResilience(readiness?.resilience_score ?? null)}
          accent="recovery"
        />
        <MetricCard label="VO₂ Max" value={activity?.vo2_max ?? null} accent="activity" />
      </section>

      {/* Nutrition + hydration (Phase 6) */}
      <section className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <span className="metric-label">Calories</span>
          <div className="flex items-baseline gap-2">
            <span className="metric-value" style={{ color: "var(--color-nutrition)" }}>
              —
            </span>
            <span className="text-text-muted text-sm">in / out</span>
          </div>
          <div className="text-text-muted flex gap-4 text-xs">
            <span>Protein —</span>
            <span>Carbs —</span>
            <span>Fat —</span>
          </div>
        </Card>
        <MetricCard
          label="Water"
          value={null}
          unit="ml"
          accent="sleep"
          caption="Goal 3000 ml"
        />
      </section>

      {/* Activity today */}
      <section className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Steps</span>
          <span className="metric-value" style={{ color: "var(--color-activity)" }}>
            {activity?.steps?.toLocaleString() ?? "—"}
          </span>
          <span className="timestamp">
            {activity?.active_calories != null
              ? `${activity.active_calories} active kcal`
              : "Workout view in Phase 4"}
          </span>
        </Card>
        <section className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Body Temp"
            value={signed(readiness?.body_temperature ?? null)}
            unit="°C"
            accent="recovery"
            caption="Deviation"
          />
          <MetricCard label="SpO₂" value={activity?.spo2_avg ?? null} unit="%" accent="sleep" />
        </section>
      </section>

      {/* Checklists + weight + sleep debt */}
      <section className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Habits</span>
          <span className="body-copy">Habit tracking lands in Phase 3</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Supplements</span>
          <span className="body-copy">Supplement tracking lands in Phase 3</span>
        </Card>
        <MetricCard
          label="Weight"
          value={null}
          unit="lbs"
          accent="nutrition"
          caption="Phase 3"
        />
        <MetricCard
          label="Sleep Debt"
          value={secondsToHours(sleep?.sleep_debt_seconds ?? null)}
          unit="hrs"
          accent="stress"
          caption="14-day running total"
        />
      </section>
    </div>
  );
}
