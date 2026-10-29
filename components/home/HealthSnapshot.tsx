import Link from "next/link";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { ScoreRing } from "@/components/charts/ScoreRing";
import { OuraRefreshControl } from "@/components/oura/OuraRefreshControl";
import { getHealthSnapshot, type HealthSnapshotData } from "@/lib/data/health-snapshot";
import {
  formatDistance,
  formatRunDuration,
  raceEventLabel,
  runTypeLabel,
} from "@/lib/run-fuel";
import { formatDuration, formatSyncStatus } from "@/lib/utils";

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

/** Running card: done today → planned today → next plan run → empty plan. */
function runningCard(data: HealthSnapshotData): { value: string | null; caption: string } {
  const { today_done, today_planned, next } = data.running;
  if (today_done) {
    return {
      value:
        today_done.distance_km != null
          ? formatDistance(today_done.distance_km)
          : formatRunDuration(today_done.duration_min),
      caption: `done today · ${
        today_done.source === "garmin"
          ? "Garmin"
          : today_done.source === "oura"
            ? "Apple Health"
            : "logged"
      }`,
    };
  }
  if (today_planned) {
    const fuel = data.nutrition.runFuel;
    const what = today_planned.is_race && today_planned.event_type
      ? raceEventLabel(today_planned.event_type)
      : runTypeLabel(today_planned.run_type);
    return {
      value:
        today_planned.planned_distance_km != null
          ? `${what} · ${formatDistance(today_planned.planned_distance_km)}`
          : what,
      caption:
        fuel?.kind === "run_fuel"
          ? `planned today · +${fuel.added_kcal} kcal fuel`
          : "planned today",
    };
  }
  if (next) {
    return {
      value:
        next.distance_km != null
          ? `${runTypeLabel(next.run_type)} · ${formatDistance(next.distance_km)}`
          : next.duration_min != null
            ? `${runTypeLabel(next.run_type)} · ${formatRunDuration(next.duration_min)}`
            : runTypeLabel(next.run_type),
      caption: "next run",
    };
  }
  return { value: null, caption: "set up a plan" };
}

/** One line under the nutrition rings when the target includes run fuel / a carb load. */
function runFuelLine(data: HealthSnapshotData): string | null {
  const fuel = data.nutrition.runFuel;
  if (!fuel) return null;
  if (fuel.kind === "carb_load") {
    return `Carb load day ${fuel.load_day_index ?? 1}/${fuel.load_day_count ?? 1} · ${data.nutrition.goalCarbs_g} g carbs`;
  }
  return `Includes +${fuel.added_kcal} kcal run fuel (${fuel.basis === "actual" ? "actual" : "estimated"})`;
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

  const asOfLabel = (iso: string | null) =>
    iso
      ? new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: data.timezone,
        })
      : null;
  const staleLabel = (iso: string | null) =>
    iso != null && iso !== data.todayIso ? asOfLabel(iso) : null;

  const readinessStale = staleLabel(data.oura.readinessAsOf);
  const sleepStale = staleLabel(data.oura.sleepAsOf);
  const activityStale = staleLabel(data.oura.activityAsOf);

  const readinessCaption = [
    data.oura.stress != null ? `${data.oura.stress} min high stress` : null,
    readinessStale ? `${readinessStale} reading` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const activityCaption = [
    data.oura.steps != null ? `${data.oura.steps.toLocaleString()} steps` : null,
    activityStale ? `${activityStale} ${data.oura.steps != null ? "score" : "reading"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const running = runningCard(data);
  const fuelLine = runFuelLine(data);

  return (
    <section className="snapshot-section section">
      <div className="snapshot-header">
        <div className="min-w-0">
          <h1 className="dash-title">{data.todayLabel}</h1>
          {data.oura.connected ? (
            <span className="snapshot-date">
              Oura{" "}
              {formatSyncStatus(data.oura.lastSyncedAt, data.timezone) ?? "not synced yet"}
            </span>
          ) : null}
        </div>
        {data.oura.connected ? (
          <OuraRefreshControl
            lastSyncedAt={data.oura.lastSyncedAt}
            timeZone={data.timezone}
            showStatus={false}
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
            {readinessCaption ? (
              <span className="snapshot-caption">{readinessCaption}</span>
            ) : null}
          </div>
        </Link>
        <Link href="/sleep" className="snapshot-link-card">
          <div className="snapshot-metric dash-card snapshot-metric-rings">
            <span className="metric-label">Sleep</span>
            <ScoreRing value={data.oura.sleepScore} accent="sleep" size={80} />
            {sleepStale ? (
              <span className="snapshot-caption">{sleepStale} reading</span>
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
            {activityCaption ? (
              <span className="snapshot-caption">{activityCaption}</span>
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
            {fuelLine ? <span className="snapshot-caption">{fuelLine}</span> : null}
          </div>
        </Link>
      </div>

      {/* Weight and supplements live in the top bar, so Home skips them. */}
      <div className="snapshot-grid snapshot-grid-2">
        <Link href="/running" className="snapshot-link-card">
          <SnapshotMetric
            label="Running"
            value={running.value}
            caption={running.caption}
            accent="var(--color-activity)"
          />
        </Link>
        <Link href="/workouts" className="snapshot-link-card">
          <SnapshotMetric
            label="Workout"
            value={workoutValue}
            caption={workoutCaption}
            accent="var(--color-activity)"
          />
        </Link>
      </div>
    </section>
  );
}
