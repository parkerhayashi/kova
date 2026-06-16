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

  function dismiss(el) {
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
    // Remove any existing splash before creating a new one (bfcache revisit).
    var prev = document.getElementById("kova-splash");
    if (prev) prev.remove();

    var el = document.createElement("div");
    el.id = "kova-splash";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = ${JSON.stringify(splashMarkup)};
    document.body.prepend(el);
    var shownAt = Date.now();

    // Dismiss once the page is fully loaded AND MIN_MS has elapsed.
    if (document.readyState === "complete") {
      holdThenDismiss(el, shownAt);
    } else {
      window.addEventListener("load", function () {
        holdThenDismiss(el, shownAt);
      }, { once: true });
    }
  }

  // Fresh page load.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showSplash, { once: true });
  } else {
    showSplash();
  }

  // PWA home-screen tap or bfcache restore — always show splash again.
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) showSplash();
  });
})();
`.trim();
