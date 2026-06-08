"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Detects the browser's IANA timezone and persists it when it differs from the
 * stored value, so clock times render in the user's local zone and follow them
 * when they travel. Renders nothing.
 */
export function TimezoneSync({ current }: { current: string }) {
  const router = useRouter();

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected || detected === current) return;

    let cancelled = false;
    fetch("/api/settings/timezone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: detected }),
    })
      .then((res) => {
        // Re-render server components so already-fetched times reformat in the
        // new zone without a manual reload.
        if (res.ok && !cancelled) router.refresh();
      })
      .catch(() => {
        // Non-fatal: times fall back to the stored/default zone.
      });

    return () => {
      cancelled = true;
    };
  }, [current, router]);

  return null;
}
