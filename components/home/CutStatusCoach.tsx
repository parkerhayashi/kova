"use client";

import { useState } from "react";
import type { CutCoachMode, CutCoachResult } from "@/lib/cut-coach";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<CutCoachResult["status"], string> = {
  on_track: "On track",
  adjust: "Adjust",
  insufficient_data: "Need data",
};

function phaseLabel(phase: CutCoachResult["phase"]): string {
  switch (phase) {
    case "cut":
      return "Cut";
    case "bulk":
      return "Bulk";
    case "maintain":
      return "Maintain";
  }
}

export function CutStatusCoach({
  daily,
  weekly,
  aiConfigured,
}: {
  daily: CutCoachResult;
  weekly: CutCoachResult;
  aiConfigured: boolean;
}) {
  const [mode, setMode] = useState<CutCoachMode>("daily");
  const result = mode === "daily" ? daily : weekly;
  const phase = result.phase;

  return (
    <section className="cut-coach-section section">
      <div className="cut-coach-header">
        <div>
          <h2 className="section-title">Cut coach</h2>
          <span className="cut-coach-meta">
            {phaseLabel(phase)}
            {aiConfigured ? " · AI" : " · rules"}
          </span>
        </div>
        <div className="cut-coach-tabs" role="tablist" aria-label="Coach view">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "daily"}
            className={cn("cut-coach-tab", mode === "daily" && "cut-coach-tab-active")}
            onClick={() => setMode("daily")}
          >
            Today
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "weekly"}
            className={cn("cut-coach-tab", mode === "weekly" && "cut-coach-tab-active")}
            onClick={() => setMode("weekly")}
          >
            This week
          </button>
        </div>
      </div>

      <div className="dash-card cut-coach-card">
        <div className="cut-coach-verdict">
          <span
            className={cn(
              "cut-coach-status",
              result.status === "on_track" && "cut-coach-status-on",
              result.status === "adjust" && "cut-coach-status-adjust",
              result.status === "insufficient_data" && "cut-coach-status-muted",
            )}
          >
            {STATUS_LABEL[result.status]}
          </span>
          <h3 className="cut-coach-headline">{result.headline}</h3>
        </div>
        <p className="cut-coach-summary">{result.summary}</p>
        <p className="cut-coach-action">
          <span className="metric-label">Next step</span>
          {result.action}
        </p>
      </div>
    </section>
  );
}
