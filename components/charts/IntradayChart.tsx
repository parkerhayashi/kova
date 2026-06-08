"use client";

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { accentColor, type Accent } from "@/lib/utils";

interface IntradayChartProps {
  data: { label: string; value: number | null }[];
  accent?: Accent;
  height?: number;
  unit?: string;
}

/**
 * IntradayChart — a dense line over a single night/day (heart rate, HRV).
 * Many points, so no fill and sparse time ticks (blueprint §4 chart rules).
 */
export function IntradayChart({
  data,
  accent = "recovery",
  height = 160,
  unit,
}: IntradayChartProps) {
  const color = accentColor[accent];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          minTickGap={48}
        />
        <YAxis hide domain={["dataMin - 2", "dataMax + 2"]} />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.12)" }}
          contentStyle={{
            background: "#1e1e1e",
            border: "0.5px solid rgba(255,255,255,0.12)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "rgba(255,255,255,0.55)" }}
          itemStyle={{ color }}
          formatter={(v) => [unit ? `${v} ${unit}` : `${v}`, ""]}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.75}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
