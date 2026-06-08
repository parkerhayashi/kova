import { NavBar } from "@/components/NavBar";
import { maybeSyncOuraOnOpen } from "@/lib/data/oura";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Refresh Oura data when the app is opened (self-throttled, runs after the
  // response so it never delays the render).
  await maybeSyncOuraOnOpen();

  return (
    <div className="min-h-full">
      <NavBar />
      {/* Side rail offset on desktop; bottom-nav clearance on mobile. */}
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 md:pb-10 md:pl-60 md:pr-6">
        {children}
      </main>
    </div>
  );
}
