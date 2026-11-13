import Link from "next/link";
import { after } from "next/server";
import { PageHeader } from "@/components/PageHeader";
import { RideDetail } from "@/components/cycling/RideDetail";
import { Card } from "@/components/ui/Card";
import {
  getGarminActivitiesBetween,
  getGarminActivityStreams,
  getGarminStatus,
  syncGarminIfStale,
} from "@/lib/data/garmin";
import { getTimezone } from "@/lib/data/oura";
import { kmToMiles } from "@/lib/run-fuel";
import { addDays, formatIsoDateLabel, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

const RECENT_DAYS = 30;
/** Rides whose trace is loaded up front (the rest show summary stats only). */
const STREAMED_RIDES = 10;

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="space-y-1">
      <span className="metric-label">{label}</span>
      <p className="text-2xl font-bold tabular-nums" style={{ color: "var(--color-activity)" }}>
        {value}
        {unit ? <span className="text-text-muted ml-1 text-sm font-normal">{unit}</span> : null}
      </p>
    </div>
  );
}

/** Cycling — Garmin rides, indoor and outdoor. */
export default async function CyclingPage() {
  after(syncGarminIfStale);
  const today = todayInTimezone(await getTimezone());
  const [rides, garmin] = await Promise.all([
    getGarminActivitiesBetween(addDays(today, -(RECENT_DAYS - 1)), today, "cycling"),
    getGarminStatus(),
  ]);
  const streams = await getGarminActivityStreams(rides.slice(0, STREAMED_RIDES).map((r) => r.id));

  const hours = rides.reduce((s, r) => s + r.duration_min, 0) / 60;
  const miles = rides.reduce((s, r) => s + (r.distance_km ? kmToMiles(r.distance_km) : 0), 0);
  const avg = (values: (number | null)[]) => {
    const v = values.filter((x): x is number => x != null);
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const avgPower = avg(rides.map((r) => r.avg_power_w));
  const avgHr = avg(rides.map((r) => r.avg_hr));
  const load = rides.reduce((s, r) => s + (r.training_load ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Cycling" subtitle="Rides from Garmin, indoor and outdoor." />

      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label={`Rides · ${RECENT_DAYS}d`} value={String(rides.length)} />
        <Stat label="Time" value={(Math.round(hours * 10) / 10).toString()} unit="h" />
        <Stat label="Distance" value={Math.round(miles).toString()} unit="mi" />
        <Stat label="Avg power" value={avgPower != null ? String(avgPower) : "—"} unit={avgPower != null ? "W" : undefined} />
        <Stat label="Avg HR" value={avgHr != null ? String(avgHr) : "—"} unit={avgHr != null ? "bpm" : undefined} />
      </Card>
      {load > 0 ? (
        <p className="text-text-muted -mt-3 text-xs">Garmin training load from rides: {Math.round(load)}</p>
      ) : null}

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <span className="metric-label">Recent rides</span>
          <Link href="/training" className="text-text-secondary hover:text-text-primary text-xs">
            Training calendar →
          </Link>
        </div>
        {rides.length === 0 ? (
          <Card className="space-y-2">
            <p className="body-copy text-sm">No rides in the last {RECENT_DAYS} days.</p>
            <p className="text-text-muted text-xs">
              {garmin.configured
                ? "Record a ride (or indoor ride) on your Garmin and it shows up here after the next sync."
                : "Connect Garmin in Settings → Connections to import rides."}
            </p>
          </Card>
        ) : (
          rides.map((ride) => (
            <Card key={ride.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-text-muted text-xs">{formatIsoDateLabel(ride.date)}</span>
                <Link
                  href={`/training?date=${ride.date}`}
                  className="text-text-secondary hover:text-text-primary text-xs"
                >
                  Day →
                </Link>
              </div>
              <RideDetail ride={ride} stream={streams[ride.id] ?? null} />
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
