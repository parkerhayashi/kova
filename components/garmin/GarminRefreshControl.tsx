"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { syncGarminAction } from "@/app/(dashboard)/running/actions";
import { formatSyncStatus } from "@/lib/utils";

/** Garmin sync button (+ optional "Garmin <time>" line). Garmin is pull-only, so this asks it now. */
export function GarminRefreshControl({
  lastSyncedAt,
  timeZone,
  showStatus = true,
}: {
  lastSyncedAt: string | null;
  timeZone: string;
  /** False when the page renders the "Garmin <time>" line itself (Home header). */
  showStatus?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const status = formatSyncStatus(lastSyncedAt, timeZone);

  function refresh() {
    setError(null);
    startTransition(async () => {
      try {
        await syncGarminAction();
      } catch {
        setError("Garmin sync failed — see Settings → Connections.");
      } finally {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {showStatus ? (
          // "N minutes ago" is clock-relative; server and client can straddle a minute.
          <span className="timestamp hidden sm:inline" suppressHydrationWarning>
            Garmin {status ?? "not synced yet"}
          </span>
        ) : null}
        <button
          type="button"
          onClick={refresh}
          disabled={pending}
          aria-label="Sync Garmin"
          className="border-border-strong hover:bg-surface-raised inline-flex size-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
        </button>
      </div>
      {showStatus && status ? (
        <span className="timestamp sm:hidden" suppressHydrationWarning>
          Garmin {status}
        </span>
      ) : null}
      {error ? <span className="max-w-[16rem] text-right text-xs text-text-secondary">{error}</span> : null}
    </div>
  );
}
