"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { LazyDualTrendChart as DualTrendChart } from "@/components/charts/lazyCharts";
import { formatDistance, formatPace, formatRunDuration, kmToMiles, runPaceMinPerKm } from "@/lib/run-fuel";
import { cn } from "@/lib/utils";
import type { ActualRun, RunLap, RunStreamPoints } from "@/types";

/** Zone colors run cool → hot. Zones are data, so semantic accents apply. */
const ZONE_COLORS = [
  "var(--color-sleep)",
  "var(--color-recovery)",
  "var(--color-activity)",
  "var(--color-nutrition)",
  "var(--color-stress)",
];

const round = (n: number, places = 0) => Math.round(n * 10 ** places) / 10 ** places;

/** Minutes → "9:32" (or "1:02:15"). */
function clock(min: number): string {
  const total = Math.round(min * 60);
  const h = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

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
 * Chart series: one point per 0.1 mi (per minute without distance), averaging
 * the trace inside each bucket. Unique labels keep Recharts' category axis
 * honest, and averaging tames GPS pace noise.
 */
function chartSeries(stream: RunStreamPoints) {
  const buckets = new Map<string, { pace: number[]; hr: number[] }>();
  stream.t.forEach((sec, i) => {
    const d = stream.dist[i];
    const label = d != null ? `${round(kmToMiles(d), 1)} mi` : `${Math.round(sec / 60)} min`;
    const b = buckets.get(label) ?? { pace: [], hr: [] };
    const speed = stream.speed[i];
    if (speed != null && speed > 0.5) b.pace.push(1609.344 / speed / 60);
    const hr = stream.hr[i];
    if (hr != null) b.hr.push(hr);
    buckets.set(label, b);
  });
  const mean = (xs: number[], places: number) =>
    xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length, places) : null;
  const labels = [...buckets.keys()];
  return {
    labels,
    pace: labels.map((l) => mean(buckets.get(l)!.pace, 2)),
    hr: labels.map((l) => mean(buckets.get(l)!.hr, 0)),
  };
}

/** Garmin run detail: stats, HR zones, pace + HR chart, splits. */
export function RunDetail({
  run,
  laps,
  stream,
}: {
  run: ActualRun;
  laps: RunLap[];
  stream: RunStreamPoints | null;
}) {
  const [open, setOpen] = useState(false);
  const m = run.metrics ?? {};
  const ft = (meters: number | null | undefined) =>
    meters != null ? `${Math.round(meters * 3.28084)} ft` : null;

  const stats: { label: string; value: string | null; sub?: string | null }[] = [
    {
      label: "Pace",
      value: runPaceMinPerKm(run) != null ? formatPace(runPaceMinPerKm(run)) : null,
      sub:
        m.avg_grade_adjusted_speed_mps
          ? `${formatPace(1000 / m.avg_grade_adjusted_speed_mps / 60)} grade-adjusted`
          : null,
    },
    {
      label: "Heart rate",
      value: run.avg_hr != null ? `${Math.round(run.avg_hr)} bpm` : null,
      sub: run.max_hr != null ? `max ${Math.round(run.max_hr)}` : null,
    },
    {
      label: "Elevation",
      value: ft(run.elevation_gain_m) ? `+${ft(run.elevation_gain_m)}` : null,
      sub: ft(m.elevation_loss_m) ? `−${ft(m.elevation_loss_m)}` : null,
    },
    {
      label: "Cadence",
      value: run.avg_cadence_spm != null ? `${Math.round(run.avg_cadence_spm)} spm` : null,
      sub: m.max_cadence_spm != null ? `max ${Math.round(m.max_cadence_spm)}` : null,
    },
    {
      label: "Moving time",
      value: m.moving_duration_min != null ? formatRunDuration(m.moving_duration_min) : null,
      sub: m.elapsed_duration_min != null ? `${formatRunDuration(m.elapsed_duration_min)} elapsed` : null,
    },
    { label: "Calories", value: run.calories != null ? `${Math.round(run.calories)} kcal` : null },
    {
      label: "Training effect",
      value:
        m.aerobic_te != null
          ? `${round(m.aerobic_te, 1)} aerobic`
          : null,
      sub: [
        m.anaerobic_te != null ? `${round(m.anaerobic_te, 1)} anaerobic` : null,
        m.te_label ? m.te_label.replaceAll("_", " ").toLowerCase() : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    },
    { label: "Training load", value: m.training_load != null ? String(Math.round(m.training_load)) : null },
    { label: "VO2 max", value: m.vo2max != null ? String(round(m.vo2max, 1)) : null },
    { label: "Power", value: m.avg_power_w != null ? `${Math.round(m.avg_power_w)} W` : null },
    {
      label: "Stride",
      value: m.avg_stride_m != null ? `${round(m.avg_stride_m, 2)} m` : null,
      sub: [
        m.avg_ground_contact_ms != null ? `${Math.round(m.avg_ground_contact_ms)} ms contact` : null,
        m.avg_vertical_oscillation_cm != null ? `${round(m.avg_vertical_oscillation_cm, 1)} cm bounce` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null,
    },
    { label: "Respiration", value: m.avg_respiration != null ? `${Math.round(m.avg_respiration)} brpm` : null },
    {
      label: "Body Battery",
      value: m.body_battery_delta != null ? `${m.body_battery_delta > 0 ? "+" : ""}${m.body_battery_delta}` : null,
    },
    {
      label: "Fastest mile",
      value: m.fastest_mile_min != null ? clock(m.fastest_mile_min) : null,
      sub: m.fastest_5k_min != null ? `5K ${formatPace(m.fastest_5k_min / 5)}` : null,
    },
  ];
  // Manual and Apple Health runs have nothing beyond the quick line.
  if (!run.metrics && laps.length === 0 && !stream) return null;
  const shown = stats.filter((s) => s.value != null);

  const zones = m.hr_zone_min ?? null;
  const zoneTotal = zones?.reduce((a, b) => a + b, 0) ?? 0;

  // Chart: pace (min/mi) and HR against distance.
  const chart = stream ? chartSeries(stream) : null;

  return (
    <div className="space-y-3">
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
              <span className="metric-label">Pace & heart rate</span>
              <DualTrendChart
                labels={chart.labels}
                primary={chart.pace}
                secondary={chart.hr}
                primaryLabel="Pace (min/mi)"
                secondaryLabel="Heart rate"
                primaryAccent="activity"
                secondaryAccent="stress"
                height={180}
              />
            </div>
          ) : null}

          {laps.length > 0 ? (
            <div className="space-y-1.5">
              <span className="metric-label">Splits</span>
              <div className="overflow-x-auto">
                <table className="w-full text-sm tabular-nums">
                  <thead>
                    <tr className="text-text-muted text-left text-xs">
                      <th className="py-1 pr-3 font-medium">Lap</th>
                      <th className="py-1 pr-3 font-medium">Dist</th>
                      <th className="py-1 pr-3 font-medium">Time</th>
                      <th className="py-1 pr-3 font-medium">Pace</th>
                      <th className="py-1 pr-3 font-medium">HR</th>
                      <th className="py-1 pr-3 font-medium">Cad</th>
                      <th className="py-1 font-medium">Elev</th>
                    </tr>
                  </thead>
                  <tbody>
                    {laps.map((lap) => (
                      <tr key={lap.id} className="border-border border-t">
                        <td className="py-1.5 pr-3">{lap.lap_index}</td>
                        <td className="py-1.5 pr-3">{formatDistance(lap.distance_km)}</td>
                        <td className="py-1.5 pr-3">
                          {lap.duration_min != null ? clock(lap.duration_min) : "—"}
                        </td>
                        <td className="py-1.5 pr-3" style={{ color: "var(--color-activity)" }}>
                          {lap.duration_min != null && lap.distance_km
                            ? formatPace(lap.duration_min / lap.distance_km)
                            : "—"}
                        </td>
                        <td className="py-1.5 pr-3">{lap.avg_hr != null ? Math.round(lap.avg_hr) : "—"}</td>
                        <td className="py-1.5 pr-3">
                          {lap.avg_cadence_spm != null ? Math.round(lap.avg_cadence_spm) : "—"}
                        </td>
                        <td className="text-text-muted py-1.5">
                          {lap.elevation_gain_m != null
                            ? `+${Math.round(lap.elevation_gain_m * 3.28084)}/−${Math.round((lap.elevation_loss_m ?? 0) * 3.28084)}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
