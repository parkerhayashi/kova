import { PageHeader } from "@/components/PageHeader";
import { PlannedList } from "@/components/PlannedList";

export default function RecoveryPage() {
  return (
    <div>
      <PageHeader title="Recovery" subtitle="Readiness, HRV, and cardiovascular trends." />
      <PlannedList
        phase="Phase 2"
        items={[
          "Readiness score history (30-day)",
          "HRV trend with 7-day rolling average",
          "Resting heart rate trend",
          "Body temperature deviation from baseline",
          "Cardiovascular age trend",
          "Resilience score trend",
          "VO₂ max history",
        ]}
      />
    </div>
  );
}
