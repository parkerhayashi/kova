"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { TrendChart } from "@/components/charts/TrendChart";
import { addDays, cn, rollingAverage, shortDate } from "@/lib/utils";
import type { WeightLog } from "@/types";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

interface WeightTrendProps {
  logs: WeightLog[];
  today: string;
}

/** Weight trend with a range toggle and a trailing-average smoothing line. */
export function WeightTrend({ logs, today }: WeightTrendProps) {
  const [range, setRange] = useState<Range>(30);

  const cutoff = addDays(today, -range);
  const inRange = logs.filter((l) => l.date >= cutoff);
  const smoothed = rollingAverage(
    inRange.map((l) => l.weight_lbs),
    range === 7 ? 3 : 7,
  );
  const data = inRange.map((l, i) => ({
    label: shortDate(l.date),
    value: l.weight_lbs,
    avg: smoothed[i],
  }));

  return (
    <Card className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="metric-label">Trend</span>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                r === range
                  ? "bg-[rgba(255,255,255,0.10)] text-text-primary"
                  : "text-text-muted hover:text-text-secondary",
              )}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>
      {data.some((d) => d.value !== null) ? (
        <TrendChart data={data} accent="nutrition" height={200} showAvg />
      ) : (
        <p className="body-copy text-sm">No entries in this range yet.</p>
      )}
    </Card>
  );
}
