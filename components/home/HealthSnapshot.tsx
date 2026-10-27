import Link from "next/link";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { ScoreRing } from "@/components/charts/ScoreRing";
import { OuraRefreshControl } from "@/components/oura/OuraRefreshControl";
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
    data.workout.status === "completed_today"
      ? data.workout.title
      : data.workout.last_session?.title ?? null;
  const workoutCaption =
    data.workout.insight ??
    (data.workout.status === "completed_today"
      ? `${data.workout.volume_lbs?.toLocaleString() ?? "—"} lb · ${formatDuration(data.workout.duration_seconds ?? 0)}`
      : "log in Hevy");

  const weightCaption = data.weight
    ? new Date(`${data.weight.date}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "log on Weight";

  const activityIsStale =
    data.oura.activityAsOf != null && data.oura.activityAsOf !== data.todayIso;

  const activityAsOfLabel = activityIsStale
    ? new Date(`${data.oura.activityAsOf}T12:00:00`).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        timeZone: data.timezone,
      })
    : null;

  const readinessIsStale =
    data.oura.readinessAsOf != null &&
    data.oura.readinessAsOf !== data.todayIso;
  const sleepIsStale =
    data.oura.sleepAsOf != null && data.oura.sleepAsOf !== data.todayIso;

  const asOfLabel = (iso: string | null) =>
    iso
      ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: data.timezone,
        })
      : null;

  return (
    <section className="snapshot-section section">
      <div className="snapshot-header">
        <div>
          <h2 className="section-title">Snapshot</h2>
          <span className="snapshot-date">{data.todayLabel}</span>
        </div>
        {data.oura.connected ? (
          <OuraRefreshControl
            lastSyncedAt={data.oura.lastSyncedAt}
            timeZone={data.timezone}
          />
        ) : null}
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
        <Link href="/recovery" className="snapshot-link-card">
          <div className="snapshot-metric dash-card snapshot-metric-rings">
            <span className="metric-label">Readiness</span>
            <ScoreRing
              value={data.oura.readinessScore}
              accent="recovery"
              size={80}
            />
            {readinessIsStale && asOfLabel(data.oura.readinessAsOf) ? (
              <span className="snapshot-caption">
                {asOfLabel(data.oura.readinessAsOf)} reading
              </span>
            ) : null}
          </div>
        </Link>
        <Link href="/sleep" className="snapshot-link-card">
          <div className="snapshot-metric dash-card snapshot-metric-rings">
            <span className="metric-label">Sleep</span>
            <ScoreRing value={data.oura.sleepScore} accent="sleep" size={80} />
            {sleepIsStale && asOfLabel(data.oura.sleepAsOf) ? (
              <span className="snapshot-caption">
                {asOfLabel(data.oura.sleepAsOf)} reading
              </span>
            ) : null}
          </div>
        </Link>
        <Link href="/activity" className="snapshot-link-card">
          <div className="snapshot-metric dash-card snapshot-metric-rings">
            <span className="metric-label">Activity</span>
            <ScoreRing
              value={data.oura.activityScore}
              accent="activity"
              size={80}
            />
            {data.oura.steps != null ? (
              <span className="snapshot-caption">
                {data.oura.steps.toLocaleString()} steps
                {activityIsStale && activityAsOfLabel
                  ? ` · ${activityAsOfLabel} score`
                  : ""}
              </span>
            ) : activityIsStale && activityAsOfLabel ? (
              <span className="snapshot-caption">{activityAsOfLabel} reading</span>
            ) : null}
          </div>
        </Link>
      </div>

      <div className="snapshot-grid">
        <Link href="/nutrition" className="snapshot-link-card">
          <div className="snapshot-metric dash-card snapshot-metric-rings">
            <span className="metric-label">Nutrition</span>
            <div className="snapshot-rings-row">
              <ProgressRing
                value={data.nutrition.calories}
                max={data.nutrition.goalCalories}
                label="Cal"
                unit="kcal"
                accent="nutrition"
                size={72}
              />
              <ProgressRing
                value={data.nutrition.protein_g}
                max={data.nutrition.goalProtein_g}
                label="Protein"
                unit="g"
                accent="nutrition"
                size={72}
              />
            </div>
            <span className="snapshot-caption">
              C{" "}
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
      </div>

      <div className="snapshot-grid snapshot-grid-3">
        <Link href="/workouts" className="snapshot-link-card">
          <SnapshotMetric
            label="Workout"
            value={workoutValue}
            caption={workoutCaption}
            accent="var(--color-activity)"
          />
        </Link>
        <Link href="/weight" className="snapshot-link-card">
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
      </div>

      {(data.oura.stress != null ||
        (data.oura.steps != null && data.oura.activityScore == null)) && (
        <div className="snapshot-grid snapshot-grid-2">
          {data.oura.steps != null && data.oura.activityScore == null ? (
            <Link href="/activity" className="snapshot-link-card">
              <SnapshotMetric
                label="Steps"
                value={data.oura.steps.toLocaleString()}
                caption="from Oura"
                accent="var(--color-activity)"
              />
            </Link>
          ) : null}
          {data.oura.stress != null ? (
            <Link href="/recovery" className="snapshot-link-card">
              <SnapshotMetric
                label="Stress"
                value={data.oura.stress}
                unit="min"
                caption="high-stress time"
                accent="var(--color-stress)"
              />
            </Link>
          ) : null}
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
