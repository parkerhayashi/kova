import { Suspense } from "react";
import { after } from "next/server";
import { NavBar } from "@/components/NavBar";
import { ScrollReset } from "@/components/ScrollReset";
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
