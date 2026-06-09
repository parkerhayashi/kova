"use client";

import {
  ResponsiveContainer,
  Scatter,
  ScatterChart as RechartsScatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { accentColor, type Accent } from "@/lib/utils";
import type { ScatterPoint } from "@/lib/trends/correlation";

interface ScatterChartProps {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xAccent?: Accent;
  yAccent?: Accent;
  height?: number;
}

/**
 * Scatter plot for cross-metric correlations — blueprint §4: no gridlines,
 * muted axes, semantic accent on points.
 */
export function ScatterChart({
  points,
  xLabel,
  yLabel,
  xAccent = "sleep",
  yAccent = "recovery",
  height = 200,
}: ScatterChartProps) {
  const xColor = accentColor[xAccent];
  const yColor = accentColor[yAccent];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsScatter margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
        <XAxis
          type="number"
          dataKey="x"
          name={xLabel}
          tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          label={{
            value: xLabel,
            position: "insideBottom",
            offset: -2,
            fill: "rgba(255,255,255,0.35)",
            fontSize: 10,
          }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yLabel}
          tick={{ fill: "rgba(255,255,255,0.30)", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={36}
          label={{
            value: yLabel,
            angle: -90,
            position: "insideLeft",
            fill: "rgba(255,255,255,0.35)",
            fontSize: 10,
          }}
        />
        <ZAxis range={[48, 48]} />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.12)" }}
          contentStyle={{
            background: "#141923",
            border: "1px solid rgba(125,165,205,0.2)",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "rgba(231,240,250,0.55)" }}
          formatter={(value, name) => [
            value ?? "—",
            name === "x" ? xLabel : yLabel,
          ]}
          labelFormatter={(_, payload) =>
            (payload?.[0]?.payload as ScatterPoint | undefined)?.label ?? ""
          }
        />
        <Scatter
          data={points}
          fill={xColor}
          stroke={yColor}
          strokeWidth={1}
          style={{ filter: `drop-shadow(0 0 4px ${xColor})` }}
        />
      </RechartsScatter>
    </ResponsiveContainer>
  );
}
