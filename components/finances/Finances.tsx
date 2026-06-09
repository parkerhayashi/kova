"use client";

import { useEffect, useRef } from "react";
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

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    function renderApp() {
      if (cancelled || !ref.current) return;
      cleanup?.();
      ref.current.innerHTML = FINANCES_HTML;
      cleanup = mountFinances();
    }

    renderApp();

    void hydrateClientSync(["finances"]).then((result) => {
      if (result.finances) renderApp();
    });

    const onSync = (e: Event) => {
      const ns = (e as CustomEvent<{ namespace?: string }>).detail?.namespace;
      if (ns === "finances") renderApp();
    };
    window.addEventListener(CLIENT_SYNC_CHANGED_EVENT, onSync);

    return () => {
      cancelled = true;
      window.removeEventListener(CLIENT_SYNC_CHANGED_EVENT, onSync);
      cleanup?.();
      if (ref.current) ref.current.innerHTML = "";
    };
  }, []);

  return <div className="fin-app" ref={ref} />;
}
