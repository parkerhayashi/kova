import Link from "next/link";
import { ProgressRing } from "@/components/charts/ProgressRing";
import { ScoreRing } from "@/components/charts/ScoreRing";
import { GarminRefreshControl } from "@/components/garmin/GarminRefreshControl";
import { InjuryCheckinPrompt } from "@/components/injuries/InjuryLog";
import { TodayCard } from "@/components/performance/TodayCard";
import { getInjuries } from "@/lib/data/injuries";
import { getPerformance } from "@/lib/data/performance";
import { getHealthSnapshot, type HealthSnapshotData } from "@/lib/data/health-snapshot";
import {
  formatDistance,
  formatPace,
  formatRunDuration,
  raceEventLabel,
  raceTitle,
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
      // Quick view: pace and heart rate when known, then the source.
      caption: [
        "done today",
        today_done.distance_km != null
          ? formatPace(today_done.duration_min / today_done.distance_km)
          : null,
        today_done.avg_hr != null ? `${Math.round(today_done.avg_hr)} bpm` : null,
        today_done.source === "garmin"
          ? "Garmin"
          : today_done.source === "oura"
            ? "Apple Health"
            : "logged",
      ]
        .filter(Boolean)
        .join(" · "),
    };
  }
  if (today_planned) {
    const fuel = data.nutrition.runFuel;
    const what = today_planned.is_race
      ? raceTitle(today_planned)
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
  const kind = race.event_type ? raceEventLabel(race.event_type, race.distance_km) : "Race";
  // A titled race shows its name, with the event ("14.2 mi race") in the caption.
  const name = race.name?.trim() || kind;
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
    date: race.date,
    dateLabel: name === kind ? fmt(race.date) : `${kind} · ${fmt(race.date)}`,
    value: race.days_until === 0 ? "Today" : race.days_until === 1 ? "Tomorrow" : String(race.days_until),
    unit: race.days_until > 1 ? "days" : null,
    alert,
    note,
  };
}

function RaceCountdown({ race }: { race: ReturnType<typeof raceCard> }) {
  return (
    <Link href={`/training?date=${race.date}`} className="snapshot-link-card race-countdown-link">
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
  const [data, perf, injuries] = await Promise.all([
    getHealthSnapshot(),
    getPerformance(90),
    getInjuries(false),
  ]);

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

  const w = data.wellness;
  const sleepStale = staleLabel(w.sleepAsOf);
  const batteryStale = staleLabel(w.bodyBatteryAsOf);
  const stepsStale = staleLabel(w.stepsAsOf);
  const caption = (...parts: (string | null | false)[]) => parts.filter(Boolean).join(" · ");

  const sleepCaption = caption(
    w.sleepSeconds != null ? formatDuration(w.sleepSeconds) : null,
    sleepStale ? `${sleepStale} night` : null,
  );
  // Body Battery now, with the morning high and last night's HRV.
  const batteryCaption = caption(
    w.bodyBatteryMorning != null ? `woke at ${w.bodyBatteryMorning}` : null,
    w.hrvMs != null ? `HRV ${w.hrvMs} ms` : null,
    w.restingHr != null ? `RHR ${Math.round(w.restingHr)}` : null,
    batteryStale ? `${batteryStale} reading` : null,
  );
  const stepsCaption = caption(
    w.stepGoal != null ? `goal ${(w.stepGoal / 1000).toFixed(1)}k` : null,
    w.intensityMin != null ? `${Math.round(w.intensityMin)} intensity min` : null,
    stepsStale ? `${stepsStale}` : null,
  );

  const running = runningCard(data);
  const fuelLine = runFuelLine(data);
  const race = data.running.next_race ? raceCard(data.running.next_race, data.todayIso) : null;

  return (
    <section className="snapshot-section section">
      <div className="snapshot-header">
        <div className="min-w-0">
          <h1 className="dash-title">{data.todayLabel}</h1>
          {w.garminConfigured ? (
            <span className="snapshot-date" suppressHydrationWarning>
              Garmin {formatSyncStatus(w.lastSyncedAt, data.timezone) ?? "not synced yet"}
            </span>
          ) : null}
        </div>
        {w.garminConfigured ? (
          <GarminRefreshControl lastSyncedAt={w.lastSyncedAt} timeZone={data.timezone} showStatus={false} />
        ) : null}
      </div>

      {!w.garminConfigured && (
        <div className="dash-card snapshot-banner">
          <span className="snapshot-caption">
            Connect Garmin for sleep, Body Battery, HRV and steps.
          </span>
          <Link href="/settings/connections" className="snapshot-link">
            Connections
          </Link>
        </div>
      )}

      {race?.alert ? <RaceCountdown race={race} /> : null}

      <TodayCard data={perf} />
      <InjuryCheckinPrompt views={injuries} />

      <div className="snapshot-grid snapshot-grid-3">
        <Link href="/sleep" className="snapshot-link-card">
          <div className="snapshot-metric dash-card snapshot-metric-rings">
            <span className="metric-label">Sleep</span>
            <ScoreRing value={w.sleepScore} accent="sleep" size={80} />
            {sleepCaption ? <span className="snapshot-caption">{sleepCaption}</span> : null}
          </div>
        </Link>
        <Link href="/recovery" className="snapshot-link-card">
          <div className="snapshot-metric dash-card snapshot-metric-rings">
            <span className="metric-label">Battery</span>
            <ScoreRing value={w.bodyBattery} accent="recovery" size={80} />
            {batteryCaption ? <span className="snapshot-caption">{batteryCaption}</span> : null}
          </div>
        </Link>
        <Link href="/activity" className="snapshot-link-card">
          <div className="snapshot-metric dash-card snapshot-metric-rings">
            <span className="metric-label">Steps</span>
            <ProgressRing
              value={w.steps}
              max={w.stepGoal ?? 10_000}
              accent="activity"
              size={80}
              format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v)))}
            />
            {stepsCaption ? <span className="snapshot-caption">{stepsCaption}</span> : null}
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
