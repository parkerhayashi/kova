import { Card } from "@/components/ui/Card";
import { DualTrendChart } from "@/components/charts/DualTrendChart";
import type { DualTrendView } from "@/lib/trends/types";

export function DualTrendCard({ view }: { view: DualTrendView }) {
  const hasPrimary = view.primary.some((v) => v !== null);
  const hasSecondary = view.secondary.some((v) => v !== null);
  const hasData = hasPrimary || hasSecondary;

  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <span className="metric-label">{view.title}</span>
        <p className="body-copy text-sm">{view.subtitle}</p>
      </div>

      {hasData ? (
        <DualTrendChart
          labels={view.labels}
          primary={view.primary}
          secondary={view.secondary}
          primaryLabel={view.primaryLabel}
          secondaryLabel={view.secondaryLabel}
          primaryAccent={view.primaryAccent}
          secondaryAccent={view.secondaryAccent}
        />
      ) : (
        <p className="body-copy text-sm">
          Log weight and sync Oura activity to see this trend.
        </p>
      )}

      {hasData ? (
        <div className="flex gap-4">
          <span className="timestamp flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: "var(--color-activity)" }}
            />
            {view.primaryLabel}
          </span>
          <span className="timestamp flex items-center gap-1.5">
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: "var(--color-nutrition)" }}
            />
            {view.secondaryLabel}
          </span>
        </div>
      ) : null}
    </Card>
  );
}
