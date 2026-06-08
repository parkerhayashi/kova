"use client";

import {
  Area,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { accentColor, type Accent } from "@/lib/utils";

interface TrendPoint {
  label: string;
  value: number | null;
  /** Optional rolling-average overlay (e.g. 7-day HRV average). */
  avg?: number | null;
}

interface TrendChartProps {
  data: TrendPoint[];
  accent?: Accent;
  height?: number;
  /** Show the x-axis labels (dates). Off by default for compact sparklines. */
  showAxis?: boolean;
  /** Draw the dashed rolling-average line from each point's `avg`. */
  showAvg?: boolean;
}

/**
 * TrendChart — Recharts area/line wrapper following blueprint §4 chart rules:
 * no gridlines, colored line + soft fill on dark surface, muted axis text.
 * Optionally overlays a dashed rolling-average line.
 */
export function TrendChart({
  data,
  accent = "recovery",
  height = 180,
  showAxis = true,
  showAvg = false,
}: TrendChartProps) {
  const color = accentColor[accent];
  const gradientId = `grad-${accent}`;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        {showAxis && (
          <XAxis
            dataKey="label"
            tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={24}
          />
        )}
        <YAxis hide domain={["dataMin", "dataMax"]} />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.12)" }}
          contentStyle={{
            background: "#141923",
            border: "1px solid rgba(125,165,205,0.2)",
            borderRadius: 8,
            fontSize: 12,
            boxShadow: "0 0 20px rgba(0,0,0,0.5)",
          }}
          labelStyle={{ color: "rgba(231,240,250,0.55)" }}
          itemStyle={{ color }}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke="none"
          fill={`url(#${gradientId})`}
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          connectNulls
          style={{ filter: `drop-shadow(0 0 5px ${color})` }}
        />
        {showAvg && (
          <Line
            type="monotone"
            dataKey="avg"
            stroke="rgba(255,255,255,0.4)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            connectNulls
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
