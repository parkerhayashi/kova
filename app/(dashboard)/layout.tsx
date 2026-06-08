import { NavBar } from "@/components/NavBar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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
