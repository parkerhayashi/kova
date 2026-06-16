"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_DEBOUNCE_MS = 400;

/** Local calendar date — used to detect midnight rollover on revisit. */
function localTodayKey(): string {
  return new Intl.DateTimeFormat("en-CA").format(new Date());
}

/**
 * Keeps the home snapshot server-rendered on every visit: invalidates the
 * client router cache when the tab regains focus, the page is restored from
 * bfcache, or the calendar day rolls over while the PWA stays open.
 */
export function HomeSnapshotRefresh() {
  const router = useRouter();

  useEffect(() => {
    let debounce: ReturnType<typeof setTimeout> | undefined;

    function refresh() {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        router.refresh();
      }, REFRESH_DEBOUNCE_MS);
    }

    function maybeRefreshForNewDay() {
      const today = localTodayKey();
      const last = sessionStorage.getItem("kova-home-date");
      if (last && last !== today) {
        sessionStorage.setItem("kova-home-date", today);
        refresh();
        return;
      }
      if (!last) sessionStorage.setItem("kova-home-date", today);
    }

    maybeRefreshForNewDay();
    refresh();

    function onVisible() {
      if (document.hidden) return;
      maybeRefreshForNewDay();
      refresh();
    }

    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) refresh();
    }

    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      if (debounce) clearTimeout(debounce);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
