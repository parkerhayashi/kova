import { WorkoutApp } from "@/components/workouts/WorkoutApp";
import { isHevyConnected, maybeSyncHevyOnOpen } from "@/lib/data/hevy";

export const dynamic = "force-dynamic";

export default async function WorkoutsPage() {
  await maybeSyncHevyOnOpen();
  return <WorkoutApp hevyConnected={isHevyConnected()} />;
}
