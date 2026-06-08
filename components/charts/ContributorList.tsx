import { accentColor, type Accent } from "@/lib/utils";

export interface ContributorItem {
  label: string;
  value: number | null; // 0–100
}

interface ContributorListProps {
  items: ContributorItem[];
  accent?: Accent;
}

/**
 * ContributorList — the labelled 0–100 bars Oura shows beneath each score.
 * Bars are data, so they carry the accent color; the track is monochrome.
 */
export function ContributorList({
  items,
  accent = "recovery",
}: ContributorListProps) {
  const color = accentColor[accent];
  return (
    <ul className="flex flex-col gap-3">
      {items.map(({ label, value }) => (
        <li key={label} className="flex items-center gap-3">
          <span className="metric-label w-32 shrink-0 normal-case">{label}</span>
          <span className="bg-[rgba(255,255,255,0.06)] relative h-1.5 flex-1 overflow-hidden rounded-full">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${Math.max(0, Math.min(100, value ?? 0))}%`,
                background: value === null ? "transparent" : color,
              }}
            />
          </span>
          <span className="text-text-secondary w-8 shrink-0 text-right text-sm tabular-nums">
            {value ?? "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
