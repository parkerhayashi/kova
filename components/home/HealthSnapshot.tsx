import Link from "next/link";
import { getHealthSnapshot } from "@/lib/data/health-snapshot";
import { formatDuration } from "@/lib/utils";
import { formatR } from "@/lib/trends/correlation";

function SnapshotMetric({
  label,
  value,
  unit,
  caption,
  accent,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  caption?: string;
  accent?: string;
}) {
  const hasValue = value !== null && value !== "";
  return (
    <div className="snapshot-metric dash-card">
      <span className="metric-label">{label}</span>
      <span
        className="snapshot-value"
        style={accent && hasValue ? { color: accent } : undefined}
      >
        {hasValue ? value : "—"}
        {hasValue && unit ? (
          <span className="snapshot-unit">{unit}</span>
        ) : null}
      </span>
      {caption ? <span className="snapshot-caption">{caption}</span> : null}
    </div>
  );
}

export async function HealthSnapshot() {
  const data = await getHealthSnapshot();

  const workoutValue =
    data.workout.status === "in_progress" ||
    data.workout.status === "completed_today"
      ? data.workout.title
      : null;
  const workoutCaption =
    data.workout.status === "in_progress"
      ? `${formatDuration(data.workout.duration_seconds)} in progress`
      : data.workout.status === "completed_today"
        ? `${data.workout.volume_lbs?.toLocaleString() ?? "—"} lb · ${formatDuration(data.workout.duration_seconds)}`
        : "log a session";

  const weightCaption = data.weight
    ? new Date(`${data.weight.date}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "log on workouts";

  return (
    <section className="snapshot-section section">
      <div className="snapshot-header">
        <h2 className="section-title">Snapshot</h2>
        <span className="snapshot-date">{data.todayLabel}</span>
      </div>

      {!data.oura.connected && (
        <div className="dash-card snapshot-banner">
          <span className="snapshot-caption">
            Connect Oura for recovery, sleep, and activity scores.
          </span>
          <Link href="/api/auth/oura" className="snapshot-link">
            Connect Oura
          </Link>
        </div>
      )}

      <div className="snapshot-grid snapshot-grid-3">
        <Link href="/today" className="snapshot-link-card">
          <SnapshotMetric
            label="Readiness"
            value={data.oura.readinessScore}
            accent="var(--color-recovery)"
          />
        </Link>
        <Link href="/today" className="snapshot-link-card">
          <SnapshotMetric
            label="Sleep"
            value={data.oura.sleepScore}
            accent="var(--color-sleep)"
          />
        </Link>
        <Link href="/today" className="snapshot-link-card">
          <SnapshotMetric
            label="Activity"
            value={data.oura.activityScore}
            accent="var(--color-activity)"
          />
        </Link>
      </div>

      <div className="snapshot-grid snapshot-grid-2">
        <Link href="/nutrition" className="snapshot-link-card">
          <div className="snapshot-metric dash-card">
            <span className="metric-label">Nutrition</span>
            <span
              className="snapshot-value"
              style={
                data.nutrition.calories != null
                  ? { color: "var(--color-nutrition)" }
                  : undefined
              }
            >
              {data.nutrition.calories != null
                ? Math.round(data.nutrition.calories)
                : "—"}
              <span className="snapshot-unit">kcal</span>
            </span>
            <span className="snapshot-caption">
              P{" "}
              {data.nutrition.protein_g != null
                ? `${Math.round(data.nutrition.protein_g)}g`
                : "—"}{" "}
              · C{" "}
              {data.nutrition.carbs_g != null
                ? `${Math.round(data.nutrition.carbs_g)}g`
                : "—"}{" "}
              · F{" "}
              {data.nutrition.fat_g != null
                ? `${Math.round(data.nutrition.fat_g)}g`
                : "—"}
            </span>
            <span className="snapshot-caption">
              Goal {data.nutrition.goalCalories} ({data.nutrition.burnLabel})
            </span>
          </div>
        </Link>
        <Link href="/water" className="snapshot-link-card">
          <SnapshotMetric
            label="Water"
            value={data.water.ml > 0 ? data.water.ml : null}
            unit={`/ ${data.water.goalMl} ml`}
            caption={data.water.ml > 0 ? "logged today" : "tap to log"}
            accent="var(--color-sleep)"
          />
        </Link>
      </div>

      <div className="snapshot-grid snapshot-grid-4">
        <Link href="/workouts" className="snapshot-link-card">
          <SnapshotMetric
            label="Workout"
            value={workoutValue}
            caption={workoutCaption}
            accent="var(--color-activity)"
          />
        </Link>
        <Link href="/workouts" className="snapshot-link-card">
          <SnapshotMetric
            label="Weight"
            value={data.weight?.weight_lbs ?? null}
            unit={data.weight?.weight_lbs != null ? "lb" : undefined}
            caption={weightCaption}
            accent="var(--color-activity)"
          />
        </Link>
        <Link href="/supplements" className="snapshot-link-card">
          <SnapshotMetric
            label="Supplements"
            value={
              data.supplements.total
                ? `${data.supplements.done}/${data.supplements.total}`
                : null
            }
            caption={
              data.supplements.total ? "taken today" : "add supplements"
            }
            accent="var(--color-nutrition)"
          />
        </Link>
        <Link href="/habits" className="snapshot-link-card">
          <SnapshotMetric
            label="Habits"
            value={
              data.habits.total ? `${data.habits.done}/${data.habits.total}` : null
            }
            caption={data.habits.total ? "done today" : "add habits"}
            accent="var(--color-recovery)"
          />
        </Link>
      </div>

      {(data.oura.steps != null || data.oura.stress != null) && (
        <div className="snapshot-grid snapshot-grid-2">
          <Link href="/today" className="snapshot-link-card">
            <SnapshotMetric
              label="Steps"
              value={data.oura.steps?.toLocaleString() ?? null}
              caption="from Oura"
              accent="var(--color-activity)"
            />
          </Link>
          <Link href="/today" className="snapshot-link-card">
            <SnapshotMetric
              label="Stress"
              value={data.oura.stress}
              unit="min"
              caption="high-stress time"
              accent="var(--color-stress)"
            />
          </Link>
        </div>
      )}

      {data.trends.length > 0 && (
        <Link href="/trends" className="snapshot-link-card">
          <div className="dash-card snapshot-trends">
            <span className="metric-label">Trends · 30 days</span>
            <ul className="snapshot-trend-list">
              {data.trends.map((t) => (
                <li key={t.id} className="snapshot-trend-row">
                  <span className="snapshot-trend-title">{t.title}</span>
                  <span className="snapshot-trend-r">
                    {formatR(t.r)}{" "}
                    <span className="snapshot-trend-strength">({t.strength})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Link>
      )}
    </section>
  );
}
