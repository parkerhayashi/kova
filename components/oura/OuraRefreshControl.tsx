"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { formatSyncStatus } from "@/lib/utils";

export function OuraRefreshControl({
  lastSyncedAt,
  timeZone,
}: {
  lastSyncedAt: string | null;
  timeZone: string;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);

  const status = formatSyncStatus(lastSyncedAt, timeZone);

  async function refresh() {
    setSyncing(true);
    setError(null);
    setNeedsReconnect(false);
    try {
      const res = await fetch("/api/oura/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        const message = data.error ?? "Sync failed.";
        if (/reconnect|expired|not connected/i.test(message)) {
          setNeedsReconnect(true);
        }
        throw new Error(message);
      }
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
          <span className="timestamp hidden sm:inline">Oura {status}</span>
        ) : (
          <span className="timestamp hidden sm:inline">Oura not synced yet</span>
        )}
        <button
          type="button"
          onClick={refresh}
          disabled={syncing}
          aria-label="Refresh Oura data"
          className="border-border-strong hover:bg-surface-raised inline-flex size-8 items-center justify-center rounded-lg border transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${syncing ? "animate-spin" : ""}`} />
        </button>
      </div>
      {status ? (
        <span className="timestamp sm:hidden">Oura {status}</span>
      ) : null}
      {error ? (
        <span className="max-w-[16rem] text-right text-xs text-[var(--color-stress)]">
          {needsReconnect ? "Oura connection expired." : error}
          {needsReconnect ? (
            <>
              {" "}
              <Link href="/api/auth/oura" className="underline">
                Reconnect
              </Link>
            </>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
