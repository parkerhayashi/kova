import { Suspense } from "react";
import { after } from "next/server";
import { NavBar } from "@/components/NavBar";
import { ScrollReset } from "@/components/ScrollReset";
import { SyncBootstrap } from "@/components/SyncBootstrap";
import { TimezoneProvider } from "@/components/TimezoneProvider";
import { TopBar } from "@/components/TopBar";
import { syncGarminIfStale } from "@/lib/data/garmin";
import { reconcilePlan } from "@/lib/data/plan";

export const dynamic = "force-dynamic";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Garmin is pull-only: opening Kova pulls new data after the page is sent
  // (throttled to every 15 min). Oura is retired — its history stays, it no
  // longer syncs. New watch data can change the plan (a missed or off-plan
  // session), so the plan re-adapts after each sync.
  after(async () => {
    if (await syncGarminIfStale()) await reconcilePlan().catch((err) => console.error("[plan] reconcile failed", err));
  });

  return (
    <div className="min-h-full">
      <Suspense fallback={null}>
        <TimezoneProvider />
      </Suspense>
      <SyncBootstrap />
      <NavBar />
      {/*
       * kova-scroll is a fixed, viewport-spanning, opaque scroll container.
       * This is what suppresses iOS 26's "scroll-edge effect" — Safari only
       * frosts top-edge content in a standalone PWA when it is NOT inside a
       * viewport-sized fixed/sticky opaque container. The sticky TopBar lives
       * inside it, so its pills render crisp instead of behind a glass blur.
       * (NavBar stays outside: it is independently fixed to the viewport.)
       * md:pl-60 insets content past the desktop side rail.
       */}
      <div className="kova-scroll md:pl-60">
        <ScrollReset />
        <TopBar />
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 md:pb-10 md:pr-6">
          {children}
        </main>
      </div>
    </div>
  );
}
