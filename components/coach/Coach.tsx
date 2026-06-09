"use client";

import { useEffect, useRef } from "react";
import "./coach.css";
import { COACH_HTML, mountCoach } from "./coachApp";
import {
  CLIENT_SYNC_CHANGED_EVENT,
  hydrateClientSync,
} from "@/lib/client-sync";

/**
 * Progressive Overload Coach. The feature is imperative DOM logic (ported from a
 * standalone single-file app); React just hands it a container. We inject the
 * markup directly in the effect so each mount starts from a clean DOM, which keeps
 * StrictMode's double-invoke from double-binding the app's event listeners.
 */
export function Coach({ refreshKey = 0 }: { refreshKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    function renderApp() {
      if (cancelled || !ref.current) return;
      cleanup?.();
      ref.current.innerHTML = COACH_HTML;
      cleanup = mountCoach();
    }

    // Render immediately from localStorage; hydrate server data in the background.
    renderApp();

    void hydrateClientSync(["coach"]).then((result) => {
      if (result.coach) renderApp();
    });

    const onSync = (e: Event) => {
      const ns = (e as CustomEvent<{ namespace?: string }>).detail?.namespace;
      if (ns === "coach") renderApp();
    };
    window.addEventListener(CLIENT_SYNC_CHANGED_EVENT, onSync);

    return () => {
      cancelled = true;
      window.removeEventListener(CLIENT_SYNC_CHANGED_EVENT, onSync);
      cleanup?.();
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [refreshKey]);

  return <div className="po-app" ref={ref} />;
}
