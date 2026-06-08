import { PageHeader } from "@/components/PageHeader";
import { PlannedList } from "@/components/PlannedList";

export default function WorkoutsPage() {
  return (
    <div>
      <PageHeader title="Workouts" subtitle="Strength and cardio on one timeline." />
      <PlannedList
        phase="Phases 4–5"
        items={[
          "Strength sessions from Hevy: volume, exercises, sets, reps",
          "Runs from Strava: distance, pace, HR, elevation, splits",
          "Weekly training load bar chart (combined)",
          "Cardio + strength on unified activity timeline",
          "PR tracking per exercise",
        ]}
      />
    </div>
  );
}
