"use client";

import { useEffect } from "react";
import {
  hydrateClientSync,
  refreshClientSyncFromServer,
} from "@/lib/client-sync";

const FOCUS_REFRESH_MS = 1000;

/** Warm sync cache on load; refresh from server when the tab regains focus. */
export function SyncBootstrap() {
  useEffect(() => {
    void hydrateClientSync();

    let debounce: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        void refreshClientSyncFromServer();
      }, FOCUS_REFRESH_MS);
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });

    return () => {
      if (debounce) clearTimeout(debounce);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return null;
}
