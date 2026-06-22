import { Suspense } from "react";
import { DashboardHome } from "@/components/home/DashboardHome";
import {
  CutStatusCoachFallback,
  CutStatusCoachLoader,
} from "@/components/home/CutStatusCoachLoader";
import { HealthSnapshot } from "@/components/home/HealthSnapshot";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <DashboardHome
      coach={
        <Suspense fallback={<CutStatusCoachFallback />}>
          <CutStatusCoachLoader />
        </Suspense>
      }
      snapshot={
        <Suspense fallback={<HealthSnapshotFallback />}>
          <HealthSnapshot />
        </Suspense>
      }
    />
  );
}

function HealthSnapshotFallback() {
  return (
    <section className="snapshot-section section">
      <h2 className="section-title">Snapshot</h2>
      <div className="dash-card snapshot-loading">Loading snapshot…</div>
    </section>
  );
}
