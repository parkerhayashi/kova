import { PageHeader } from "@/components/PageHeader";
import { PlannedList } from "@/components/PlannedList";

export default function WeightPage() {
  return (
    <div>
      <PageHeader title="Weight" subtitle="Body composition and trend." />
      <PlannedList
        phase="Phase 3"
        items={[
          "Daily weight entry (manual from Eufy scale)",
          "Weight trend chart (7 / 30 / 90 days)",
          "Body fat % (optional)",
          "Running average smoothing on chart",
          "Goal weight progress indicator",
        ]}
      />
    </div>
  );
}
