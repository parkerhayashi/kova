"use client";

import { useEffect, useRef, useState } from "react";
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
export function Coach() {
  const ref = useRef<HTMLDivElement>(null);
  const [syncGen, setSyncGen] = useState(0);

  useEffect(() => {
    const onSync = (e: Event) => {
      const ns = (e as CustomEvent<{ namespace?: string }>).detail?.namespace;
      if (ns === "coach") setSyncGen((g) => g + 1);
    };
    window.addEventListener(CLIENT_SYNC_CHANGED_EVENT, onSync);
    return () => window.removeEventListener(CLIENT_SYNC_CHANGED_EVENT, onSync);
  }, []);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void hydrateClientSync(["coach"]).then(() => {
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = COACH_HTML;
      cleanup = mountCoach();
    });

    return () => {
      cancelled = true;
      cleanup?.();
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [syncGen]);

  return <div className="po-app" ref={ref} />;
}
