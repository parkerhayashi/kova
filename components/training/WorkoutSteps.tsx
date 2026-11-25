import type { WorkoutStep } from "@/types";

const mins = (m: number | null | undefined) =>
  m == null ? null : m < 1 ? `${Math.round(m * 60)} s` : `${Math.round(m * 10) / 10} min`;

/** Structured workout steps (repeats nested), readable on a phone mid-run. */
export function WorkoutSteps({ steps }: { steps: WorkoutStep[] | null }) {
  if (!steps?.length) return null;
  return (
    <ol className="space-y-1.5">
      {steps.map((s, i) => (
        <li key={i} className="text-sm">
          {s.repeat && s.steps ? (
            <div className="border-border space-y-1 rounded-lg border p-2">
              <p className="font-semibold">
                {s.repeat} × {s.label}
              </p>
              <ol className="text-text-secondary space-y-0.5 pl-3">
                {s.steps.map((c, j) => (
                  <li key={j} className="flex flex-wrap justify-between gap-x-3">
                    <span>
                      {c.label} {mins(c.minutes) ? <span className="tabular-nums">· {mins(c.minutes)}</span> : null}
                    </span>
                    {c.target ? <span className="text-text-muted text-xs">{c.target}</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="flex flex-wrap justify-between gap-x-3">
              <span>
                {s.label} {mins(s.minutes) ? <span className="text-text-secondary tabular-nums">· {mins(s.minutes)}</span> : null}
              </span>
              {s.target ? <span className="text-text-muted text-xs">{s.target}</span> : null}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
