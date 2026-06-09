import { after } from "next/server";
import { NavBar } from "@/components/NavBar";
import { SyncBootstrap } from "@/components/SyncBootstrap";
import { TimezoneSync } from "@/components/TimezoneSync";
import { TopBar } from "@/components/TopBar";
import { getTimezone, maybeSyncOuraOnOpen } from "@/lib/data/oura";
import { getSupplements, getSupplementLogs } from "@/lib/data/tracking";
import { DEFAULT_TIMEZONE, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Oura refresh is best-effort and must not block the shell from rendering.
  after(() => {
    maybeSyncOuraOnOpen().catch((err) => {
      console.warn("[layout] oura sync-on-open failed:", (err as Error).message);
    });
  });

  let timezone = DEFAULT_TIMEZONE;
  let initialStack = { done: 0, total: 0 };

  try {
    const [tz, supplements, supplementLogs] = await Promise.all([
      getTimezone(),
      getSupplements(true),
      getSupplementLogs(1),
    ]);
    timezone = tz;
    const today = todayInTimezone(timezone);
    const takenIds = new Set(
      supplementLogs
        .filter((l) => l.date === today && l.taken)
        .map((l) => l.supplement_id),
    );
    initialStack = {
      done: supplements.filter((s) => takenIds.has(s.id)).length,
      total: supplements.length,
    };
  } catch (err) {
    console.error("[layout] dashboard data load failed:", (err as Error).message);
  }

  return (
    <div className="min-h-full">
      <TimezoneSync current={timezone} />
      <SyncBootstrap />
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
