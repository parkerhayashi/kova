import { PageHeader } from "@/components/PageHeader";
import { PlannedList } from "@/components/PlannedList";

export default function SleepPage() {
  return (
    <div>
      <PageHeader title="Sleep" subtitle="Stages, efficiency, and sleep debt over time." />
      <PlannedList
        phase="Phase 2"
        items={[
          "Sleep score, efficiency, latency, restfulness",
          "Stage breakdown: REM / Deep / Light / Awake bar chart",
          "7-day sleep score trend line chart",
          "HRV during sleep time-series",
          "Sleep debt vs. sleep need over 14 days",
          "Best and worst night highlights",
        ]}
      />
    </div>
  );
}
