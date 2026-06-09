"use client";

import { useEffect, useRef, useState } from "react";
import "./finances.css";
import { FINANCES_HTML, mountFinances } from "./financesApp";
import {
  CLIENT_SYNC_CHANGED_EVENT,
  hydrateClientSync,
} from "@/lib/client-sync";

/**
 * Finances. Like the Coach feature, this is imperative DOM logic ported from a
 * standalone single-file app; React just hands it a container. We inject the
 * markup in the effect so each mount starts from a clean DOM, which keeps
 * StrictMode's double-invoke from double-binding the app's listeners and timers.
 */
export function Finances() {
  const ref = useRef<HTMLDivElement>(null);
  const [syncGen, setSyncGen] = useState(0);

  useEffect(() => {
    const onSync = (e: Event) => {
      const ns = (e as CustomEvent<{ namespace?: string }>).detail?.namespace;
      if (ns === "finances") setSyncGen((g) => g + 1);
    };
    window.addEventListener(CLIENT_SYNC_CHANGED_EVENT, onSync);
    return () => window.removeEventListener(CLIENT_SYNC_CHANGED_EVENT, onSync);
  }, []);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    void hydrateClientSync(["finances"]).then(() => {
      if (cancelled || !ref.current) return;
      ref.current.innerHTML = FINANCES_HTML;
      cleanup = mountFinances();
    });

    return () => {
      cancelled = true;
      cleanup?.();
      if (ref.current) ref.current.innerHTML = "";
    };
  }, [syncGen]);

  return <div className="fin-app" ref={ref} />;
}
