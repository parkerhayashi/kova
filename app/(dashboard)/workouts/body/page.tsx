import Link from "next/link";
import { CoachBody } from "@/components/coach/CoachBody";
import { PageHeader } from "@/components/PageHeader";

export default function WorkoutBodyPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workouts"
        title="Progress photos"
        subtitle="Take and compare progress photos. Log daily weight on the Weight page."
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
