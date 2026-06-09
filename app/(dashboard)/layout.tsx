import { NavBar } from "@/components/NavBar";
import { TimezoneSync } from "@/components/TimezoneSync";
import { TopBar } from "@/components/TopBar";
import { getTimezone, maybeSyncOuraOnOpen } from "@/lib/data/oura";
import { getSupplements, getSupplementLogs } from "@/lib/data/tracking";
import { todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Refresh Oura data when the app is opened (self-throttled, runs after the
  // response so it never delays the render).
  await maybeSyncOuraOnOpen();
  const [timezone, supplements, supplementLogs] = await Promise.all([
    getTimezone(),
    getSupplements(true),
    getSupplementLogs(1),
  ]);

  // Seed the top bar's Stack pill so it has a real count before the client
  // poll kicks in (avoids a 0/0 flash on first paint).
  const today = todayInTimezone(timezone);
  const takenIds = new Set(
    supplementLogs.filter((l) => l.date === today && l.taken).map((l) => l.supplement_id),
  );
  const initialStack = {
    done: supplements.filter((s) => takenIds.has(s.id)).length,
    total: supplements.length,
  };

  return (
    <div className="min-h-full">
      <TimezoneSync current={timezone} />
      <NavBar />
      {/* Side rail offset on desktop; bottom-nav clearance on mobile. */}
      <div className="md:pl-60">
        <TopBar initialStack={initialStack} />
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 md:pb-10 md:pr-6">
          {children}
        </main>
      </div>
    </div>
  );
}
