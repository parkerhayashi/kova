import { readFileSync } from "fs";
import { join } from "path";

const WORDMARK_SVG = readFileSync(
  join(process.cwd(), "public/brand/kova-wordmark-white.svg"),
  "utf8",
).replace(/<\?xml[^?]*\?>\s*/i, "");

export const SPLASH_STYLES = `
#kova-splash {
  position: fixed;
  inset: 0;
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000000;
  transition: opacity 0.35s ease;
}
#kova-splash.kova-splash--hide {
  opacity: 0;
  pointer-events: none;
}
#kova-splash .kova-splash-wordmark {
  width: min(200px, 72vw);
}
#kova-splash .kova-splash-wordmark svg {
  display: block;
  width: 100%;
  height: auto;
}
`.trim();

const splashMarkup = `<div class="kova-splash-wordmark">${WORDMARK_SVG}</div>`;

/** Injected once via inline script — outside React to avoid hydration/nav issues. */
export const SPLASH_BOOT_SCRIPT = `
(function () {
  var MIN_MS = 1500;
  var FADE_MS = 350;
  var SEEN_KEY = "kova:splash-seen";

  function seenThisSession() {
    try {
      return sessionStorage.getItem(SEEN_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function markSeen() {
    try {
      sessionStorage.setItem(SEEN_KEY, "1");
    } catch (e) {}
  }

  function dismiss(el) {
    markSeen();
    el.classList.add("kova-splash--hide");
    window.setTimeout(function () { el.remove(); }, FADE_MS + 50);
  }

  function holdThenDismiss(el, shownAt) {
    var elapsed = Date.now() - shownAt;
    var remaining = MIN_MS - elapsed;
    if (remaining > 0) {
      window.setTimeout(function () { dismiss(el); }, remaining);
    } else {
      dismiss(el);
    }
  }

  function showSplash() {
    if (document.getElementById("kova-splash")) return;

    var el = document.createElement("div");
    el.id = "kova-splash";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = ${JSON.stringify(splashMarkup)};
    document.body.prepend(el);
    var shownAt = Date.now();

    if (document.readyState === "complete") {
      holdThenDismiss(el, shownAt);
    } else {
      window.addEventListener("load", function () {
        holdThenDismiss(el, shownAt);
      }, { once: true });
    }
  }

  function maybeShowSplash(fromBfcache) {
    // In-app page changes reuse the same tab session — skip after first show.
    // Bfcache restore (PWA resume from home screen) always replays the splash.
    if (!fromBfcache && seenThisSession()) return;
    showSplash();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      maybeShowSplash(false);
    }, { once: true });
  } else {
    maybeShowSplash(false);
  }

  window.addEventListener("pageshow", function (e) {
    if (e.persisted) maybeShowSplash(true);
  });
})();
`.trim();
