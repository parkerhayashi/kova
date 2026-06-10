import { Card } from "@/components/ui/Card";
import { LazyScatterChart as ScatterChart } from "@/components/charts/lazyCharts";
import {
  describeCorrelation,
  formatR,
} from "@/lib/trends/correlation";
import type { CorrelationView } from "@/lib/trends/types";

export function CorrelationCard({ view }: { view: CorrelationView }) {
  const hasData = view.points.length >= view.minPairs;

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <span className="metric-label">{view.title}</span>
          <p className="body-copy text-sm">{view.subtitle}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-text-primary text-lg font-medium tracking-tight">
            {formatR(view.r)}
          </div>
          <div className="timestamp">{describeCorrelation(view.r)}</div>
        </div>
      </div>

      {hasData ? (
        <ScatterChart
          points={view.points}
          xLabel={view.xLabel}
          yLabel={view.yLabel}
          xAccent={view.xAccent}
          yAccent={view.yAccent}
        />
      ) : (
        <p className="body-copy text-sm">
          Need at least {view.minPairs} paired days — sync Oura or log habits to
          populate this view.
        </p>
      )}

      {hasData ? (
        <span className="timestamp">
          {view.points.length} days · r = {formatR(view.r)}
        </span>
      ) : null}
    </Card>
  );
}
