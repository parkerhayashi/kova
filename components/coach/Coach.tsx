"use client";

import { useEffect, useRef } from "react";
import "./coach.css";
import { COACH_HTML, mountCoach } from "./coachApp";

/**
 * Progressive Overload Coach. The feature is imperative DOM logic (ported from a
 * standalone single-file app); React just hands it a container. We inject the
 * markup directly in the effect so each mount starts from a clean DOM, which keeps
 * StrictMode's double-invoke from double-binding the app's event listeners.
 */
export function Coach() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    root.innerHTML = COACH_HTML;
    const cleanup = mountCoach();
    return () => {
      cleanup?.();
      root.innerHTML = "";
    };
  }, []);

  return <div className="po-app" ref={ref} />;
}
