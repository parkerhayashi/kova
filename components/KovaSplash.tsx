"use client";

import { useEffect, useState } from "react";

const MIN_MS = 1500;
const FADE_MS = 350;
const MAX_MS = 8000;
const SEEN_KEY = "kova:splash-seen";

function seenThisSession(): boolean {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* private browsing */
  }
}

type SplashPhase = "visible" | "hiding" | "gone";

/** Branded launch splash — must live in React to avoid body hydration mismatches. */
export function KovaSplash({ wordmarkSvg }: { wordmarkSvg: string }) {
  const [phase, setPhase] = useState<SplashPhase>("visible");

  useEffect(() => {
    if (seenThisSession()) {
      setPhase("gone");
      return;
    }

    const shownAt = Date.now();
    let dismissed = false;

    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      markSeen();
      setPhase("hiding");
      window.setTimeout(() => setPhase("gone"), FADE_MS + 50);
    }

    function holdThenDismiss() {
      const remaining = MIN_MS - (Date.now() - shownAt);
      if (remaining > 0) {
        window.setTimeout(dismiss, remaining);
      } else {
        dismiss();
      }
    }

    const maxTimer = window.setTimeout(dismiss, MAX_MS);

    if (document.readyState === "complete") {
      holdThenDismiss();
    } else {
      window.addEventListener("load", holdThenDismiss, { once: true });
    }

    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      dismissed = false;
      setPhase("visible");
      holdThenDismiss();
    };
    window.addEventListener("pageshow", onPageShow);

    return () => {
      window.clearTimeout(maxTimer);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      id="kova-splash"
      aria-hidden="true"
      className={phase === "hiding" ? "kova-splash--hide" : undefined}
    >
      <div
        className="kova-splash-wordmark"
        dangerouslySetInnerHTML={{ __html: wordmarkSvg }}
      />
    </div>
  );
}
