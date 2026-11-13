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
        const found = [
          r.runs_found ? `${r.runs_found} run${r.runs_found === 1 ? "" : "s"}` : null,
          r.rides_found ? `${r.rides_found} ride${r.rides_found === 1 ? "" : "s"}` : null,
          r.strength_found ? `${r.strength_found} strength session${r.strength_found === 1 ? "" : "s"}` : null,
        ].filter(Boolean);
        setMessage(
          found.length === 0
            ? "Synced — nothing on Garmin in this window yet."
            : `Synced ${found.join(", ")}.`,
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
