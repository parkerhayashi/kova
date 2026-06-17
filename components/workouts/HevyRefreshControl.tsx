"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatSyncStatus } from "@/lib/utils";

export function HevyRefreshControl({
  lastSyncedAt,
  timeZone,
  onSynced,
}: {
  lastSyncedAt: string | null;
  timeZone: string;
  onSynced?: () => void;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = formatSyncStatus(lastSyncedAt, timeZone);

  async function refresh() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/hevy/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed.");
      onSynced?.();
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {status ? (
          <span className="timestamp hidden sm:inline">Hevy {status}</span>
        ) : (
          <span className="timestamp hidden sm:inline">Hevy not synced yet</span>
        )}
        <button
          type="button"
          onClick={refresh}
          disabled={syncing}
          aria-label="Refresh Hevy workouts"
          className="border-border-strong hover:bg-surface-raised inline-flex size-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`size-4 ${syncing ? "animate-spin" : ""}`}
            strokeWidth={1.5}
          />
        </button>
      </div>
      {error ? <span className="text-xs text-[var(--color-stress)]">{error}</span> : null}
    </div>
  );
}
