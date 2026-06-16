import Link from "next/link";
import { addDays } from "@/lib/utils";

interface HeatmapProps {
  /** Map of ISO date → completion ratio (0–1). */
  ratios: Record<string, number>;
  today: string;
  weeks?: number;
  accent?: string;
  label?: string;
  /** When set, cells link to this path with `?date=`. */
  linkPath?: string;
}

/**
 * GitHub-style completion calendar. Columns are weeks (Sun–Sat); cell opacity
 * scales with the day's completion ratio. The filled color is data, so an
 * accent is allowed (blueprint §4).
 */
export function Heatmap({
  ratios,
  today,
  weeks = 18,
  accent = "var(--color-recovery)",
  label = "Completion",
  linkPath,
}: HeatmapProps) {
  // Anchor the last column to the week containing today (week starts Sunday).
  const todayDow = new Date(`${today}T00:00:00Z`).getUTCDay();
  const lastSunday = addDays(today, -todayDow);
  const firstSunday = addDays(lastSunday, -(weeks - 1) * 7);

  const columns: string[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: string[] = [];
    for (let d = 0; d < 7; d++) col.push(addDays(firstSunday, w * 7 + d));
    columns.push(col);
  }

  function cellStyle(date: string): React.CSSProperties {
    if (date > today) return { background: "transparent" };
    const r = ratios[date];
    if (r === undefined || r === 0)
      return { background: "rgba(125,165,205,0.06)" };
    // Map ratio onto 0.25–1 opacity so any completion is visible, with a glow
    // that intensifies with completion.
    const opacity = 0.25 + r * 0.75;
    return {
      background: accent,
      opacity,
      boxShadow: `0 0 ${4 + r * 6}px ${accent}`,
    };
  }

  return (
    <div className="space-y-2">
      <span className="metric-label">{label}</span>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {columns.map((col, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {col.map((date) => {
              const style = cellStyle(date);
              const cell = (
                <div
                  title={`${date}`}
                  className="size-[11px] rounded-[2px]"
                  style={style}
                />
              );
              if (linkPath && date <= today) {
                return (
                  <Link
                    key={date}
                    href={`${linkPath}?date=${date}`}
                    aria-label={`Edit habits for ${date}`}
                    className="block rounded-[2px] outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                  >
                    {cell}
                  </Link>
                );
              }
              return <div key={date}>{cell}</div>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
