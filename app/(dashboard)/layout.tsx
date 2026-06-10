import { Suspense } from "react";
import { after } from "next/server";
import { NavBar } from "@/components/NavBar";
import { SyncBootstrap } from "@/components/SyncBootstrap";
import { TimezoneProvider } from "@/components/TimezoneProvider";
import { TopBar } from "@/components/TopBar";
import { maybeSyncOuraOnOpen } from "@/lib/data/oura";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
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

  return (
    <div className="min-h-full">
      <Suspense fallback={null}>
        <TimezoneProvider />
      </Suspense>
      <SyncBootstrap />
      <NavBar />
      {/* Side rail offset on desktop; bottom-nav clearance on mobile. */}
      <div className="md:pl-60">
        <TopBar />
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 md:pb-10 md:pr-6">
          {children}
        </main>
      </div>
    </div>
  );
}
