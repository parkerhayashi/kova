"use client";

import { useEffect, useRef } from "react";
import "./finances.css";
import { FINANCES_HTML, mountFinances } from "./financesApp";

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
    root.innerHTML = FINANCES_HTML;
    const cleanup = mountFinances();
    return () => {
      cleanup?.();
      root.innerHTML = "";
    };
  }, []);

  return <div className="fin-app" ref={ref} />;
}
