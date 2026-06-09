import Link from "next/link";
import { CoachBody } from "@/components/coach/CoachBody";
import { PageHeader } from "@/components/PageHeader";

export default function WorkoutBodyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workouts"
        title="Body weight & photos"
        subtitle="Daily weight, composition estimate, and progress photos. To log lifts, start a live workout from the main Workouts page."
      />
      <Link
        href="/workouts"
        className="text-sm text-text-secondary hover:text-text-primary"
      >
        ← Back to workouts
      </Link>
      <CoachBody />
    </div>
  );
}
