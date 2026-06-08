import { PageHeader } from "@/components/PageHeader";
import { PlannedList } from "@/components/PlannedList";

export default function TrendsPage() {
  return (
    <div>
      <PageHeader
        title="Trends & Correlations"
        subtitle="Cross-source views no single app can show."
      />
      <PlannedList
        phase="Phase 7"
        items={[
          "Sleep quality vs. next-day readiness score",
          "HRV vs. weekly training volume",
          "Caloric surplus/deficit vs. weight trend",
          "Run pace vs. prior night sleep score",
          "Stress score vs. HRV",
          "Protein intake vs. strength volume",
          "Selectable date range: 7 / 30 / 90 days",
        ]}
      />
    </div>
  );
}
