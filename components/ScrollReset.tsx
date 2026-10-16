"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Resets the fixed scroll shell to the top on route change. The dashboard
 * scrolls inside `.kova-scroll` (a fixed container, used to defeat iOS 26's
 * scroll-edge blur), so Next's default window scroll-to-top no longer applies.
 */
export function ScrollReset() {
  const pathname = usePathname();
  useEffect(() => {
    document.querySelector(".kova-scroll")?.scrollTo({ top: 0 });
  }, [pathname]);
  return null;
}
