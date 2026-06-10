import dynamic from "next/dynamic";
import { Card } from "@/components/ui/Card";
import { ChartSkeleton } from "@/components/charts/ChartSkeleton";
import type { Accent } from "@/lib/utils";

const TrendChart = dynamic(
  () =>
    import("@/components/charts/TrendChart").then((m) => ({
      default: m.TrendChart,
    })),
  { loading: () => <ChartSkeleton /> },
);

interface ChartCardProps {
  title: string;
  data: { label: string; value: number | null; avg?: number | null }[];
  accent?: Accent;
  /** Latest value + unit shown alongside the title. */
  current?: string | null;
  caption?: string;
  showAvg?: boolean;
  height?: number;
}

/**
 * Card wrapping a labeled TrendChart — the standard trend block for the Sleep
 * and Recovery views.
 */
export function ChartCard({
  title,
  data,
  accent = "recovery",
  current,
  caption,
  showAvg = false,
  height = 160,
}: ChartCardProps) {
  const hasData = data.some((d) => d.value !== null);
  return (
    <Card className="space-y-4">
      <div className="flex items-baseline justify-between">
        <span className="metric-label">{title}</span>
        {current ? (
          <span className="text-text-primary text-lg font-medium tracking-tight">
            {current}
          </span>
        ) : null}
      </div>
      {hasData ? (
        <TrendChart data={data} accent={accent} height={height} showAvg={showAvg} />
      ) : (
        <p className="body-copy text-sm">No data yet.</p>
      )}
      {caption ? <span className="timestamp">{caption}</span> : null}
    </Card>
  );
}
