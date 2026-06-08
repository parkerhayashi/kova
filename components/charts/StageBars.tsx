import { formatDuration } from "@/lib/utils";

interface StageBarsProps {
  rem: number | null;
  deep: number | null;
  light: number | null;
  awake: number | null;
}

// Stage colors are data, not chrome, so semantic accents are allowed here.
const STAGES = [
  { key: "deep", label: "Deep", color: "var(--color-recovery)" },
  { key: "rem", label: "REM", color: "var(--color-nutrition)" },
  { key: "light", label: "Light", color: "var(--color-sleep)" },
  { key: "awake", label: "Awake", color: "rgba(255,255,255,0.25)" },
] as const;

/**
 * Horizontal stacked bar of sleep stages with a duration legend (blueprint §7
 * Sleep view). Pure presentational — safe in a Server Component.
 */
export function StageBars({ rem, deep, light, awake }: StageBarsProps) {
  const values = { rem, deep, light, awake };
  const total =
    (rem ?? 0) + (deep ?? 0) + (light ?? 0) + (awake ?? 0) || 1;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full">
        {STAGES.map(({ key, color }) => {
          const pct = ((values[key] ?? 0) / total) * 100;
          return (
            <div
              key={key}
              style={{
                width: `${pct}%`,
                background: color,
                boxShadow: pct > 0 ? `0 0 10px ${color}` : undefined,
              }}
              className="h-full"
            />
          );
        })}
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {STAGES.map(({ key, label, color }) => (
          <li key={key} className="flex items-center gap-2">
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: color, boxShadow: `0 0 6px ${color}` }}
            />
            <span className="metric-label">{label}</span>
            <span className="text-text-secondary ml-auto text-sm tabular-nums">
              {formatDuration(values[key])}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
