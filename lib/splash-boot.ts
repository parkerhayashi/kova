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
  transition: opacity 0.25s ease;
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
  try {
    if (sessionStorage.getItem("kova:splash-dismissed") === "1") return;
  } catch (e) {
    return;
  }

  function dismiss(el) {
    try {
      sessionStorage.setItem("kova:splash-dismissed", "1");
    } catch (e) {}
    el.classList.add("kova-splash--hide");
    window.setTimeout(function () {
      el.remove();
    }, 280);
  }

  function start() {
    if (!document.body) return;

    var el = document.createElement("div");
    el.id = "kova-splash";
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = ${JSON.stringify(splashMarkup)};
    document.body.prepend(el);

    if (document.readyState === "complete") {
      dismiss(el);
    } else {
      window.addEventListener(
        "load",
        function () {
          dismiss(el);
        },
        { once: true },
      );
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
`.trim();
