"use client";

import { useEffect } from "react";

/** Registers the PWA service worker after the app mounts (client-only). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        // Pick up SW changes (e.g. RSC never-cache rules) without waiting for a
        // full browser restart — critical for nutrition UI freshness.
        void reg.update();
      })
      .catch(() => {
        // Registration failures are non-fatal — app still works online.
      });
  }, []);

  return null;
}
