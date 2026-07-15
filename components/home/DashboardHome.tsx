import type { ReactNode } from "react";

/**
 * Home dashboard — title, cut coach, and health snapshot.
 */
export function DashboardHome({
  coach,
  snapshot,
}: {
  coach: ReactNode;
  snapshot: ReactNode;
}) {
  return (
    <div className="home-dash">
      <h1 className="dash-title">My Dashboard</h1>
      {coach}
      {snapshot}
    </div>
  );
}
