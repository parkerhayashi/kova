import type { ReactNode } from "react";

/**
 * Home dashboard — glanceable numbers first (date header, recovery rings,
 * nutrition, running / workout / weight / supplements), then the coach,
 * then 30-day trends. Each section streams on its own.
 */
export function DashboardHome({
  snapshot,
  coach,
  trends,
}: {
  snapshot: ReactNode;
  coach: ReactNode;
  trends: ReactNode;
}) {
  return (
    <div className="home-dash">
      {snapshot}
      {coach}
      {trends}
    </div>
  );
}
