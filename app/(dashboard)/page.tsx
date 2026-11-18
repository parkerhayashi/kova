import { Suspense } from "react";
import { DashboardHome } from "@/components/home/DashboardHome";
import {
  CutStatusCoachFallback,
  CutStatusCoachLoader,
} from "@/components/home/CutStatusCoachLoader";
import { HealthSnapshot } from "@/components/home/HealthSnapshot";
import { HomeTrends } from "@/components/home/HomeTrends";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <DashboardHome
      snapshot={
        <Suspense fallback={<HealthSnapshotFallback />}>
          <HealthSnapshot />
        </Suspense>
      }
      coach={
        <Suspense fallback={<CutStatusCoachFallback />}>
          <CutStatusCoachLoader />
        </Suspense>
      }
      trends={
        <Suspense fallback={null}>
          <HomeTrends />
        </Suspense>
      }
    />
  );
}

function HealthSnapshotFallback() {
  return (
    <section className="snapshot-section section">
      <div className="snapshot-header">
        <h1 className="dash-title">Today</h1>
      </div>
      <div className="dash-card snapshot-loading">Loading…</div>
    </section>
  );
}
