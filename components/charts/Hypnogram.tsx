interface HypnogramProps {
  /** Oura `sleep_phase_5min`: '1' deep, '2' light, '3' rem, '4' awake. */
  phases: string | null;
}

// Stage colors are data, so semantic accents are allowed (matches StageBars).
const PHASE_COLOR: Record<string, string> = {
  "1": "var(--color-recovery)", // deep
  "2": "var(--color-sleep)", // light
  "3": "var(--color-nutrition)", // rem
  "4": "rgba(255,255,255,0.22)", // awake
};

const LEGEND = [
  { code: "1", label: "Deep" },
  { code: "3", label: "REM" },
  { code: "2", label: "Light" },
  { code: "4", label: "Awake" },
] as const;

/**
 * Hypnogram — the stage-by-stage timeline of a night, rendered as a sequential
 * colored strip from the 5-minute phase string. Pure presentational.
 */
export function Hypnogram({ phases }: HypnogramProps) {
  if (!phases) return <p className="body-copy text-sm">No hypnogram for this night.</p>;
  const slots = phases.split("");

  return (
    <div className="flex flex-col gap-3">
      <div
        className="flex h-16 w-full items-stretch gap-px overflow-hidden rounded-md"
        style={{ boxShadow: "0 0 24px rgba(91,233,255,0.07), inset 0 0 0 1px rgba(125,165,205,0.10)" }}
      >
        {slots.map((code, i) => (
          <span
            key={i}
            className="flex-1"
            style={{ background: PHASE_COLOR[code] ?? "transparent" }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-6 gap-y-2">
        {LEGEND.map(({ code, label }) => (
          <li key={code} className="flex items-center gap-2">
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: PHASE_COLOR[code], boxShadow: `0 0 6px ${PHASE_COLOR[code]}` }}
            />
            <span className="metric-label">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
