"use client";

import {
  Bar,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { accentColor, type Accent } from "@/lib/utils";

interface DualTrendChartProps {
  labels: string[];
  primary: (number | null)[];
  secondary: (number | null)[];
  primaryLabel: string;
  secondaryLabel: string;
  primaryAccent?: Accent;
  secondaryAccent?: Accent;
  /** Draw the primary series as bars (counts / totals per bin). */
  primaryAsBars?: boolean;
  height?: number;
}

/**
 * Two metrics on dual Y-axes — for trends that share a timeline but differ in
 * scale (e.g. calories vs. weight).
 */
export function DualTrendChart({
  labels,
  primary,
  secondary,
  primaryLabel,
  secondaryLabel,
  primaryAccent = "activity",
  secondaryAccent = "nutrition",
  primaryAsBars = false,
  height = 200,
}: DualTrendChartProps) {
  const primaryColor = accentColor[primaryAccent];
  const secondaryColor = accentColor[secondaryAccent];

  const data = labels.map((label, i) => ({
    label,
    primary: primary[i],
    secondary: secondary[i],
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          yAxisId="left"
          tick={{ fill: primaryColor, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ fill: secondaryColor, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.12)" }}
          contentStyle={{
            background: "var(--color-surface-raised)",
            border: "1px solid rgba(125,165,205,0.2)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "rgba(231,240,250,0.55)" }}
        />
        {primaryAsBars ? (
          <Bar
            yAxisId="left"
            dataKey="primary"
            name={primaryLabel}
            fill={primaryColor}
            fillOpacity={0.75}
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
        ) : (
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="primary"
            name={primaryLabel}
            stroke={primaryColor}
            strokeWidth={2}
            dot={false}
            connectNulls
            style={{ filter: `drop-shadow(0 0 5px ${primaryColor})` }}
          />
        )}
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="secondary"
          name={secondaryLabel}
          stroke={secondaryColor}
          strokeWidth={2}
          strokeDasharray="4 4"
          dot={false}
          connectNulls
          style={{ filter: `drop-shadow(0 0 5px ${secondaryColor})` }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
