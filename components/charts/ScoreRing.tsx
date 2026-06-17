import { accentColor, type Accent } from "@/lib/utils";

interface ScoreRingProps {
  /** 0–100 score, or null when unavailable. */
  value: number | null;
  label?: string;
  accent?: Accent;
  size?: number;
  /** Small text under the score (e.g. a qualitative label). */
  caption?: string;
}

/**
 * ScoreRing — Oura's signature circular score gauge. The arc + number are data,
 * so the accent color is allowed; the track stays monochrome chrome.
 */
export function ScoreRing({
  value,
  label,
  accent = "recovery",
  size = 140,
  caption,
}: ScoreRingProps) {
  const stroke = 6;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value)) / 100;
  const color = accentColor[accent];

  return (
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
        {value !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="butt"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className={`snapshot-ring-value tabular-nums ${
            value !== null ? "text-text-primary" : "text-text-muted"
          }`}
          style={{ fontSize: size * 0.3 }}
        >
          {value ?? "—"}
        </span>
        {label ? <span className="metric-label mt-0.5">{label}</span> : null}
        {caption ? <span className="timestamp mt-1">{caption}</span> : null}
      </div>
    </div>
  );
}
