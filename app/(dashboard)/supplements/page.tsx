import { PageHeader } from "@/components/PageHeader";
import { PlannedList } from "@/components/PlannedList";

export default function SupplementsPage() {
  return (
    <div>
      <PageHeader title="Supplements" subtitle="Daily checklist and adherence." />
      <PlannedList
        phase="Phase 3"
        items={[
          "Daily supplement checklist — one tap to mark taken",
          "Optional dose and time logging per supplement",
          "Add, edit, archive supplements with default dose and unit",
          "Adherence rate per supplement (7 / 30 day)",
          "Streak tracking per supplement",
          "Notes field per log entry for context",
        ]}
      />
    </div>
  );
}
