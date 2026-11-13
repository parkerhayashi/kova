"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { LazyDualTrendChart as DualTrendChart } from "@/components/charts/lazyCharts";
import { formatRunDuration, kmToMiles } from "@/lib/run-fuel";
import { activityTypeLabel, rideQuickStats, rideSpeedMph } from "@/lib/training-format";
import { cn } from "@/lib/utils";
import type { GarminActivity, RunStreamPoints } from "@/types";

/** Zone colors run cool → hot. Zones are data, so semantic accents apply. */
const ZONE_COLORS = [
  "var(--color-sleep)",
  "var(--color-recovery)",
  "var(--color-activity)",
  "var(--color-nutrition)",
  "var(--color-stress)",
];

const round = (n: number, places = 0) => Math.round(n * 10 ** places) / 10 ** places;

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="space-y-0.5">
      <span className="metric-label">{label}</span>
      <p className="text-text-primary text-sm font-semibold tabular-nums">{value}</p>
      {sub ? <p className="text-text-muted text-xs">{sub}</p> : null}
    </div>
  );
}

/**
 * Chart series: one point per minute, averaging the trace inside each
 * minute. Power when the ride has it (trainer / power meter), else speed.
 */
function chartSeries(stream: RunStreamPoints) {
  const usePower = stream.power?.some((p) => p != null) ?? false;
  const buckets = new Map<number, { main: number[]; hr: number[] }>();
  stream.t.forEach((sec, i) => {
    const minute = Math.floor(sec / 60);
    const b = buckets.get(minute) ?? { main: [], hr: [] };
    const main = usePower ? stream.power![i] : stream.speed[i] != null ? stream.speed[i]! * 2.236936 : null;
    if (main != null) b.main.push(main);
    const hr = stream.hr[i];
    if (hr != null) b.hr.push(hr);
    buckets.set(minute, b);
  });
  const mean = (xs: number[]) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length, 1) : null);
  const minutes = [...buckets.keys()].sort((a, b) => a - b);
  return {
    usePower,
    labels: minutes.map((m) => `${m} min`),
    main: minutes.map((m) => mean(buckets.get(m)!.main)),
    hr: minutes.map((m) => mean(buckets.get(m)!.hr)),
  };
}

/** One Garmin ride: quick line, then stats, HR zones and a power (or speed) + HR chart. */
export function RideDetail({ ride, stream }: { ride: GarminActivity; stream: RunStreamPoints | null }) {
  const [open, setOpen] = useState(false);
  const m = ride.metrics ?? {};
  const speed = rideSpeedMph(ride);

  const stats: { label: string; value: string | null; sub?: string | null }[] = [
    {
      label: "Distance",
      value: ride.distance_km ? `${round(kmToMiles(ride.distance_km), 1)} mi` : null,
      sub: speed != null ? `${speed} mph avg` : null,
    },
    {
      label: "Power",
      value: ride.avg_power_w != null ? `${Math.round(ride.avg_power_w)} W` : null,
      sub: m.normalized_power_w != null ? `${Math.round(m.normalized_power_w)} W normalized` : null,
    },
    {
      label: "Heart rate",
      value: ride.avg_hr != null ? `${Math.round(ride.avg_hr)} bpm` : null,
      sub: ride.max_hr != null ? `max ${Math.round(ride.max_hr)}` : null,
    },
    {
      label: "Cadence",
      value: ride.avg_cadence_rpm != null ? `${Math.round(ride.avg_cadence_rpm)} rpm` : null,
      sub: m.max_cadence_rpm != null ? `max ${Math.round(m.max_cadence_rpm)}` : null,
    },
    {
      label: "Elevation",
      value: ride.elevation_gain_m ? `+${Math.round(ride.elevation_gain_m * 3.28084)} ft` : null,
    },
    { label: "Calories", value: ride.calories != null ? `${Math.round(ride.calories)} kcal` : null },
    {
      label: "Training effect",
      value: ride.aerobic_te != null ? `${round(ride.aerobic_te, 1)} aerobic` : null,
      sub:
        [
          ride.anaerobic_te != null ? `${round(ride.anaerobic_te, 1)} anaerobic` : null,
          m.te_label ? m.te_label.replaceAll("_", " ").toLowerCase() : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
    },
    {
      label: "Training load",
      value: ride.training_load != null ? String(Math.round(ride.training_load)) : null,
      sub:
        m.training_stress_score != null
          ? `TSS ${Math.round(m.training_stress_score)}${m.intensity_factor != null ? ` · IF ${round(m.intensity_factor, 2)}` : ""}`
          : null,
    },
    {
      label: "Moving time",
      value: m.moving_duration_min != null ? formatRunDuration(m.moving_duration_min) : null,
    },
  ];
  const shown = stats.filter((s) => s.value != null);
  const zones = m.hr_zone_min ?? null;
  const zoneTotal = zones?.reduce((a, b) => a + b, 0) ?? 0;
  const chart = stream ? chartSeries(stream) : null;

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold">{ride.name || activityTypeLabel(ride)}</p>
        <p className="text-text-secondary text-xs tabular-nums">{rideQuickStats(ride)}</p>
        <p className="text-text-muted text-xs">{activityTypeLabel(ride)} · Garmin</p>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-text-secondary hover:text-text-primary flex items-center gap-1 text-xs"
      >
        {open ? "Hide details" : "Details"}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {shown.map((s) => (
              <Stat key={s.label} label={s.label} value={s.value!} sub={s.sub} />
            ))}
          </div>

          {zones && zoneTotal > 0 ? (
            <div className="space-y-1.5">
              <span className="metric-label">Heart-rate zones</span>
              <div className="flex h-2 overflow-hidden rounded-full">
                {zones.map((z, i) =>
                  z > 0 ? (
                    <div key={i} style={{ width: `${(z / zoneTotal) * 100}%`, background: ZONE_COLORS[i] }} />
                  ) : null,
                )}
              </div>
              <div className="text-text-muted flex flex-wrap gap-x-3 gap-y-1 text-xs tabular-nums">
                {zones.map((z, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="size-1.5 rounded-full" style={{ background: ZONE_COLORS[i] }} />
                    Z{i + 1} {Math.round(z)} min
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {chart ? (
            <div className="space-y-1">
              <span className="metric-label">{chart.usePower ? "Power" : "Speed"} & heart rate</span>
              <DualTrendChart
                labels={chart.labels}
                primary={chart.main}
                secondary={chart.hr}
                primaryLabel={chart.usePower ? "Power (W)" : "Speed (mph)"}
                secondaryLabel="Heart rate"
                primaryAccent="activity"
                secondaryAccent="stress"
                height={180}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
