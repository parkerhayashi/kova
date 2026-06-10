"use client";

import { useEffect } from "react";

function hideSplash() {
  const el = document.getElementById("kova-splash");
  if (!el || el.classList.contains("kova-splash--hide")) return;
  el.classList.add("kova-splash--hide");
  window.setTimeout(() => el.remove(), 280);
}

/** Removes the inline splash after the app shell is ready. */
export function SplashDismiss() {
  useEffect(() => {
    hideSplash();
  }, []);

  useEffect(() => {
    if (document.readyState === "complete") return;
    window.addEventListener("load", hideSplash, { once: true });
    return () => window.removeEventListener("load", hideSplash);
  }, []);

  return null;
}
