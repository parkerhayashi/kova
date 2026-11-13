"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { syncGarminAction } from "@/app/(dashboard)/running/actions";
import { Button } from "@/components/ui/Button";

export function GarminSyncButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function sync() {
    setMessage(null);
    startTransition(async () => {
      try {
        const r = await syncGarminAction();
        setMessage(
          r.runs_found === 0
            ? "Synced — no runs on Garmin in this window yet."
            : `Synced ${r.runs_found} run${r.runs_found === 1 ? "" : "s"} (${r.inserted} new, ${r.updated} updated).`,
        );
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Sync failed");
      } finally {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button type="button" variant="solid" disabled={pending} onClick={sync}>
        {pending ? "Syncing…" : "Sync now"}
      </Button>
      {message ? <span className="text-text-secondary text-sm">{message}</span> : null}
    </div>
  );
}
