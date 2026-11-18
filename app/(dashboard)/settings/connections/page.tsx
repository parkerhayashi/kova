import type { Metadata } from "next";
import Link from "next/link";
import { disconnectOuraAction } from "@/app/(dashboard)/settings/connections/actions";
import { GarminSyncButton } from "@/components/settings/GarminSyncButton";
import { Card } from "@/components/ui/Card";
import { getGarminStatus } from "@/lib/data/garmin";
import { getHevyLastSyncedAt, isHevyConnected } from "@/lib/data/hevy";
import { getOuraLastSyncedAt, getTimezone, isOuraConnected } from "@/lib/data/oura";
import { cn, formatSyncStatus } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Kova — Connections",
};

export const dynamic = "force-dynamic";

const LINKS = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/connections", label: "Connections" },
] as const;

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="text-text-secondary flex items-center gap-2 text-sm">
      {/* Status dot is data, so the recovery / stress accents apply. */}
      <span
        className="size-2 rounded-full"
        style={{ background: ok ? "var(--color-recovery)" : "var(--color-stress)" }}
      />
      {label}
    </span>
  );
}

export default async function ConnectionsSettingsPage() {
  const [garmin, ouraConnected, ouraSynced, hevySynced, timezone] = await Promise.all([
    getGarminStatus(),
    isOuraConnected(),
    getOuraLastSyncedAt(),
    getHevyLastSyncedAt(),
    getTimezone(),
  ]);
  const hevyConnected = isHevyConnected();
  const synced = (iso: string | null) => formatSyncStatus(iso, timezone) ?? "not synced yet";

  return (
    <div className="space-y-6">
      <div>
        <div className="metric-label mb-1">Settings</div>
        <h1 className="text-text-primary text-2xl font-semibold tracking-tight">Connections</h1>
      </div>

      <nav className="flex gap-2">
        {LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm transition-colors",
              href === "/settings/connections"
                ? "bg-[rgba(255,255,255,0.08)] text-text-primary"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            {label}
          </Link>
        ))}
      </nav>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="metric-label">Garmin</span>
          <Status
            ok={garmin.configured && !garmin.last_error}
            label={!garmin.configured ? "Not connected" : garmin.last_error ? "Needs attention" : "Connected"}
          />
        </div>
        {garmin.configured ? (
          <>
            <p className="text-text-secondary text-sm">Last sync {synced(garmin.last_synced_at)}</p>
            {garmin.last_error ? (
              <p className="text-text-primary text-sm">{garmin.last_error}</p>
            ) : null}
            <GarminSyncButton />
            <p className="text-text-muted text-xs">
              Runs, rides and strength sessions come in with heart rate, training effect and load
              (runs add splits, rides add power). Kova checks Garmin when you open Home, Training,
              Running or Cycling (at most every 15 minutes) and once a day. A Garmin run replaces
              the Apple Health or manual copy; a strength session pairs with its Hevy workout.
              Weigh-ins logged in Garmin land in your weight log; if you also log in Kova the same
              day, the later weigh-in wins. Sleep, HRV, Body Battery, stress and steps come from
              Garmin too.
            </p>
            <p className="text-text-muted text-xs">
              Personal API keys expire (at most a year). When this card says the key was rejected,
              create a new one in Garmin Connect and replace GARMIN_API_KEY in Vercel.
            </p>
          </>
        ) : (
          <p className="text-text-muted text-sm">
            Create a Personal API key in Garmin Connect (Account settings → Personal API) and set
            it as GARMIN_API_KEY in Vercel.
          </p>
        )}
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="metric-label">Oura</span>
          <span className="text-text-muted text-sm">Retired</span>
        </div>
        <p className="text-text-secondary text-sm">
          Garmin replaced Oura. Oura no longer syncs; your Oura history (last sync{" "}
          {synced(ouraSynced)}) stays in Sleep, Activity and Trends.
        </p>
        {ouraConnected ? (
          <form action={disconnectOuraAction}>
            <button type="submit" className="text-text-secondary hover:text-text-primary text-xs underline">
              Disconnect Oura (revoke Kova&apos;s access, keep history)
            </button>
          </form>
        ) : null}
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <span className="metric-label">Hevy</span>
          <Status ok={hevyConnected} label={hevyConnected ? "Connected" : "Not connected"} />
        </div>
        {hevyConnected ? (
          <p className="text-text-secondary text-sm">Last sync {synced(hevySynced)}</p>
        ) : (
          <p className="text-text-muted text-sm">Set HEVY_API_KEY to import lifting.</p>
        )}
      </Card>
    </div>
  );
}
