"use client";

import { Bar, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { accentColor } from "@/lib/utils";

/** Fitness (42-day) and fatigue (7-day) lines over form bars — Strava-style fitness & freshness. */
export function FitnessChart({
  data,
  height = 220,
}: {
  data: { label: string; fitness: number; fatigue: number; form: number }[];
  height?: number;
}) {
  const fitness = accentColor.recovery;
  const fatigue = accentColor.stress;
  const form = accentColor.activity;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 11 }} axisLine={false} tickLine={false} minTickGap={24} />
        <YAxis tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.12)" }}
          contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "rgba(231,240,250,0.55)" }}
        />
        <Bar dataKey="form" name="Form" fill={form} fillOpacity={0.35} radius={[2, 2, 0, 0]} />
        <Line type="monotone" dataKey="fitness" name="Fitness" stroke={fitness} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke={fatigue} strokeWidth={2} strokeDasharray="4 4" dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Weekly stacked bars (load by sport, minutes per HR zone). */
export function StackedWeeks({
  data,
  series,
  height = 180,
}: {
  data: Record<string, string | number>[];
  series: { key: string; label: string; color: string }[];
  height?: number;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis dataKey="label" tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          contentStyle={{ background: "var(--color-surface-raised)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "rgba(231,240,250,0.55)" }}
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            stackId="a"
            fill={s.color}
            fillOpacity={0.8}
            radius={i === series.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
            maxBarSize={28}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
