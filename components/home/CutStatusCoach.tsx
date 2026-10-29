import type { CutCoachResult } from "@/lib/cut-coach";
import { coachPhaseLabel, coachSectionTitle } from "@/lib/cut-coach";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<CutCoachResult["status"], string> = {
  on_track: "On track",
  adjust: "Adjust",
  insufficient_data: "Need data",
};

/** Home's coach card — today's read only (the weekly view lives in Muse). */
export function CutStatusCoach({
  daily,
  aiConfigured,
}: {
  daily: CutCoachResult;
  aiConfigured: boolean;
}) {
  return (
    <section className="cut-coach-section section">
      <div className="cut-coach-header">
        <div>
          <h2 className="section-title">{coachSectionTitle(daily.phase)}</h2>
          <span className="cut-coach-meta">
            {coachPhaseLabel(daily.phase)}
            {aiConfigured ? " · AI" : " · rules"}
          </span>
        </div>
      </div>

      <div className="dash-card cut-coach-card">
        <div className="cut-coach-verdict">
          <span
            className={cn(
              "cut-coach-status",
              daily.status === "on_track" && "cut-coach-status-on",
              daily.status === "adjust" && "cut-coach-status-adjust",
              daily.status === "insufficient_data" && "cut-coach-status-muted",
            )}
          >
            {STATUS_LABEL[daily.status]}
          </span>
          <h3 className="cut-coach-headline">{daily.headline}</h3>
        </div>
        <p className="cut-coach-summary">{daily.summary}</p>
        <p className="cut-coach-action">
          <span className="metric-label">Next step</span>
          {daily.action}
        </p>
      </div>
    </section>
  );
}
