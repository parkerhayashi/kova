"use client";

import { useEffect, useRef } from "react";
import "./coach.css";
import { COACH_HTML, mountCoach } from "./coachApp";
import {
  CLIENT_SYNC_CHANGED_EVENT,
  hydrateClientSync,
} from "@/lib/client-sync";

/**
 * Coach body-composition tools only — weight log, chart, progress photos, split
 * settings. Workout set logging is hidden; use the live workout session for that.
 */
export function CoachBody() {
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
  }, []);

  return <div className="po-app po-app--body-only" ref={ref} />;
}
