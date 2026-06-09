import type { Metadata } from "next";
import Link from "next/link";
import { MfaSetup } from "@/components/settings/MfaSetup";
import { isMfaEnabled } from "@/lib/data/auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Kova — Security",
};

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Security" },
] as const;

export default async function SecuritySettingsPage() {
  const mfaEnabled = await isMfaEnabled();

  return (
    <div className="space-y-6">
      <div>
        <div className="metric-label mb-1">Settings</div>
        <h1 className="text-text-primary text-2xl font-semibold tracking-tight">
          Security
        </h1>
      </div>

      <nav className="flex gap-2">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              href === "/settings/security"
                ? "bg-[rgba(255,255,255,0.08)] text-text-primary"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <MfaSetup enabled={mfaEnabled} />
    </div>
  );
}
