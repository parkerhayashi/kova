import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";

const today = new Date().toLocaleDateString("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
});

/**
 * Today — daily at-a-glance summary across all sources (blueprint §7).
 * Rendered as a structural shell with empty states; metrics populate once
 * Oura/Hevy/Strava sync and Supabase reads are wired in Phases 2+.
 */
export default function TodayPage() {
  return (
    <div className="space-y-8">
      <header className="mb-2">
        <p className="metric-label">Today</p>
        <h1 className="section-heading mt-1">{today}</h1>
      </header>

      {/* Primary recovery readouts */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MetricCard label="Readiness" value={null} accent="recovery" />
        <MetricCard label="Sleep Score" value={null} accent="sleep" />
        <MetricCard label="HRV" value={null} unit="ms" accent="recovery" />
      </section>

      {/* Secondary recovery metrics */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Stress" value={null} accent="stress" />
        <MetricCard label="Cardio Age" value={null} unit="yr" accent="recovery" />
        <MetricCard label="Resilience" value={null} accent="recovery" />
        <MetricCard label="VO₂ Max" value={null} accent="activity" />
      </section>

      {/* Nutrition + hydration */}
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
          <span className="metric-label">Workout Today</span>
          <span className="body-copy">No session logged yet</span>
        </Card>
        <section className="grid grid-cols-2 gap-3">
          <MetricCard label="Body Temp" value={null} unit="°" accent="recovery" />
          <MetricCard label="SpO₂" value={null} unit="%" accent="sleep" />
        </section>
      </section>

      {/* Checklists + weight + sleep debt */}
      <section className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Habits</span>
          <span className="body-copy">No habits yet — add some in Habits</span>
        </Card>
        <Card className="flex flex-col gap-2">
          <span className="metric-label">Supplements</span>
          <span className="body-copy">No supplements yet — add some</span>
        </Card>
        <MetricCard
          label="Weight"
          value={null}
          unit="lbs"
          accent="nutrition"
          caption="Last entry —"
        />
        <MetricCard
          label="Sleep Debt"
          value={null}
          unit="hrs"
          accent="stress"
          caption="Running total"
        />
      </section>
    </div>
  );
}
