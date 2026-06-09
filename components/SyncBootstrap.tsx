"use client";

import { useEffect } from "react";
import { refreshClientSyncFromServer } from "@/lib/client-sync";

/** Pull goals, coach, and finances from Supabase when the tab regains focus. */
export function SyncBootstrap() {
  useEffect(() => {
    const refresh = () => {
      void refreshClientSyncFromServer();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });
    return () => {
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return null;
}
