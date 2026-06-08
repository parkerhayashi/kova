"use client";

import { useEffect } from "react";

/** Registers the PWA service worker after the app mounts (client-only). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Registration failures are non-fatal — app still works online.
    });
  }, []);

  return null;
}
