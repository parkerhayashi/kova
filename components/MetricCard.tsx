import { Card } from "@/components/ui/Card";
import { accentColor, cn, type Accent } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  /** Accent color applied to the value only (data, not chrome). */
  accent?: Accent;
  /** Optional small caption under the value, e.g. a trend or timestamp. */
  caption?: string;
  className?: string;
}

/**
 * MetricCard — the core readout. Large number carries the visual weight;
 * the label is small and muted (blueprint §4). Accent color, when set,
 * applies to the value only.
 */
export function MetricCard({
  label,
  value,
  unit,
  accent,
  caption,
  className,
}: MetricCardProps) {
  const hasValue = value !== null && value !== undefined && value !== "";
  return (
    <Card className={cn("flex flex-col gap-2", className)}>
      <span className="metric-label">{label}</span>
      <span
        className="metric-value"
        style={accent && hasValue ? { color: accentColor[accent] } : undefined}
      >
        {hasValue ? value : "—"}
        {hasValue && unit ? (
          <span className="text-text-muted ml-1 text-base font-normal">
            {unit}
          </span>
        ) : null}
      </span>
      {caption ? <span className="timestamp">{caption}</span> : null}
    </Card>
  );
}
