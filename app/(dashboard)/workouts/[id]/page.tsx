import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { SessionEditor } from "@/components/workouts/SessionEditor";
import { getExercises, getSessionDetail } from "@/lib/data/workouts";
import { shortDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WorkoutSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, exercises] = await Promise.all([
    getSessionDetail(id),
    getExercises(true),
  ]);
  if (!detail) notFound();

  return (
    <div>
      <Link
        href="/workouts"
        className="text-text-muted hover:text-text-primary mb-4 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" /> Workouts
      </Link>
      <p className="timestamp mb-4">{shortDate(detail.session.date)}</p>
      <SessionEditor
        session={detail.session}
        initialGroups={detail.groups}
        exercises={exercises}
      />
    </div>
  );
}
