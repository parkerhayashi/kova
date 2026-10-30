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
import type { UpcomingRace } from "@/lib/data/running";
import {
  addDays,
  daysBetween,
  formatDuration,
  formatIsoDateLabel,
  formatSyncStatus,
} from "@/lib/utils";

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

/**
 * Race countdown. `alert` is the time-sensitive line (load starts tomorrow,
 * load day, race day) — when set, the card moves to the top of Home.
 */
function raceCard(race: UpcomingRace, today: string) {
  const name = race.event_type ? raceEventLabel(race.event_type, race.distance_km) : "Race";
  const fmt = (iso: string) => formatIsoDateLabel(iso);
  const carbs = race.load_carbs_g != null ? ` · ${Math.round(race.load_carbs_g)} g carbs` : "";
  let alert: string | null = null;
  let note: string | null = null;

  if (race.days_until === 0) {
    alert = "Race day. Fuel plan is on the Running tab.";
  } else if (race.load_start) {
    const loadEnd = addDays(race.date, -1);
    const untilLoad = daysBetween(race.load_start, today);
    if (untilLoad === 1) {
      alert = `Carb load starts tomorrow${carbs}/day`;
    } else if (untilLoad > 1) {
      note = `Carb load ${fmt(race.load_start)}${race.load_days > 1 ? `–${formatIsoDateLabel(loadEnd, { month: "short", day: "numeric" })}` : ""} (${race.load_days} day${race.load_days === 1 ? "" : "s"})`;
    } else if (today <= loadEnd) {
      const index = daysBetween(today, race.load_start) + 1;
      alert = `Carb load day ${index} of ${race.load_days} today${carbs}`;
    }
  } else {
    note = "Race-day fueling only, no carb load";
  }

  return {
    name,
    dateLabel: fmt(race.date),
    value: race.days_until === 0 ? "Today" : race.days_until === 1 ? "Tomorrow" : String(race.days_until),
    unit: race.days_until > 1 ? "days" : null,
    alert,
    note,
  };
}

function RaceCountdown({ race }: { race: ReturnType<typeof raceCard> }) {
  return (
    <Link href="/running" className="snapshot-link-card race-countdown-link">
      <div className="snapshot-metric dash-card race-countdown">
        <div className="race-countdown-main">
          <div className="min-w-0">
            <span className="metric-label">Next race</span>
            <p className="race-countdown-name">{race.name}</p>
            <span className="snapshot-caption">{race.dateLabel}</span>
          </div>
          <span className="snapshot-value" style={{ color: "var(--color-activity)" }}>
            {race.value}
            {race.unit ? <span className="snapshot-unit">{race.unit}</span> : null}
          </span>
        </div>
        {race.alert ? (
          <span className="race-countdown-alert">
            <span className="race-countdown-dot" aria-hidden />
            {race.alert}
          </span>
        ) : race.note ? (
          <span className="snapshot-caption">{race.note}</span>
        ) : null}
      </div>
    </Link>
  );
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
  const race = data.running.next_race ? raceCard(data.running.next_race, data.todayIso) : null;

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

      {race?.alert ? <RaceCountdown race={race} /> : null}

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
            {/* Ring colors match the Nutrition page's macro breakdown. */}
            <div className="snapshot-rings-row">
              <ProgressRing
                value={data.nutrition.calories}
                max={data.nutrition.goalCalories}
                label="Cal"
                unit="kcal"
                accent="nutrition"
                size={64}
              />
              <ProgressRing
                value={data.nutrition.protein_g}
                max={data.nutrition.goalProtein_g}
                label="Protein"
                unit="g"
                accent="nutrition"
                size={64}
              />
              <ProgressRing
                value={data.nutrition.carbs_g}
                max={data.nutrition.goalCarbs_g}
                label="Carbs"
                unit="g"
                accent="activity"
                size={64}
              />
              <ProgressRing
                value={data.nutrition.fat_g}
                max={data.nutrition.goalFat_g}
                label="Fat"
                unit="g"
                accent="stress"
                size={64}
              />
            </div>
            <span className="snapshot-caption">
              Goal {data.nutrition.goalCalories} ({data.nutrition.burnLabel})
            </span>
            {fuelLine ? <span className="snapshot-caption">{fuelLine}</span> : null}
          </div>
        </Link>
      </div>

      {race && !race.alert ? <RaceCountdown race={race} /> : null}

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
