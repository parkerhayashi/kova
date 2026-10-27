import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/Card";
import { HevyHistory } from "@/components/workouts/HevyHistory";
import { HevyRefreshControl } from "@/components/workouts/HevyRefreshControl";
import { LiftingStats } from "@/components/workouts/LiftingStats";
import {
  getHevyLastSyncedAt,
  isHevyConnected,
  listHevyWorkouts,
  maybeSyncHevyOnOpen,
} from "@/lib/data/hevy";
import { getTimezone } from "@/lib/data/oura";
import { getLiftingDashboard } from "@/lib/data/workouts";

export const dynamic = "force-dynamic";

/** Lifting history imported from Hevy — Hevy is where workouts are logged. */
export default async function WorkoutsPage() {
  await maybeSyncHevyOnOpen();
  const connected = isHevyConnected();
  const [workouts, dashboard, lastSyncedAt, timezone] = await Promise.all([
    listHevyWorkouts(50),
    getLiftingDashboard(28),
    getHevyLastSyncedAt(),
    getTimezone(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Workouts"
          subtitle="Lifting history synced from Hevy."
        />
        {connected ? (
          <HevyRefreshControl lastSyncedAt={lastSyncedAt} timeZone={timezone} />
        ) : null}
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/weight" className="text-text-secondary hover:text-text-primary">
          Weight log & trend →
        </Link>
        <Link
          href="/workouts/body"
          className="text-text-secondary hover:text-text-primary"
        >
          Progress photos →
        </Link>
      </div>

      {/* Show already-synced history even if the API key is missing. */}
      {workouts.length > 0 ? (
        <HevyHistory workouts={workouts} timezone={timezone} />
      ) : !connected ? (
        <Card>
          <p className="body-copy text-sm">
            Hevy isn&apos;t connected. Add <code>HEVY_API_KEY</code> to sync your
            workouts.
          </p>
        </Card>
      ) : null}

      <LiftingStats dashboard={dashboard} />
    </div>
  );
}
