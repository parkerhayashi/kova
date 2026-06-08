import { PageHeader } from "@/components/PageHeader";
import { PlannedList } from "@/components/PlannedList";

export default function HabitsPage() {
  return (
    <div>
      <PageHeader title="Habits" subtitle="Daily checklist with streaks and heatmap." />
      <PlannedList
        phase="Phase 3"
        items={[
          "Daily habit checklist (custom habits, reorderable)",
          "Streak tracking per habit",
          "Completion heatmap (GitHub-style calendar)",
          "Add, edit, and archive habits",
          "Weekly completion rate per habit",
        ]}
      />
    </div>
  );
}
