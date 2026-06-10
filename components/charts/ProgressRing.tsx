import { accentColor, type Accent } from "@/lib/utils";

interface ProgressRingProps {
  value: number | null;
  max: number;
  label?: string;
  unit?: string;
  accent?: Accent;
  size?: number;
  caption?: string;
}

/**
 * Goal progress ring — arc fill is current/target; center shows the raw value.
 */
export function ProgressRing({
  value,
  max,
  label,
  unit,
  accent = "nutrition",
  size = 88,
  caption,
}: ProgressRingProps) {
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const hasValue = value !== null && value > 0;
  const pct =
    hasValue && max > 0
      ? Math.max(0, Math.min(100, (value / max) * 100)) / 100
      : 0;
  const color = accentColor[accent];
  const display = hasValue ? Math.round(value) : "—";

  return (
    <div className="snapshot-ring-block">
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(125,165,205,0.10)"
            strokeWidth={stroke}
          />
          {hasValue ? (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - pct)}
            />
          ) : null}
        </svg>
        <div className="absolute flex flex-col items-center">
          <span
            className="snapshot-ring-value tabular-nums"
            style={{
              fontSize: size * 0.26,
              color: hasValue ? color : undefined,
            }}
          >
            {display}
          </span>
          {unit && hasValue ? (
            <span className="snapshot-ring-unit">{unit}</span>
          ) : null}
        </div>
      </div>
      {label ? <span className="metric-label">{label}</span> : null}
      {caption ? <span className="snapshot-caption">{caption}</span> : null}
    </div>
  );
}
