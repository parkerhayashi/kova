import { readFileSync } from "fs";
import { join } from "path";

/** Inlined so the logo paints with the first HTML chunk — no extra network round trip. */
const MARK_SVG = readFileSync(
  join(process.cwd(), "public/brand/kova-mark-white.svg"),
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
#kova-splash .kova-splash-mark {
  width: 80px;
  height: 80px;
}
#kova-splash .kova-splash-mark svg {
  display: block;
  width: 100%;
  height: 100%;
}
`.trim();

export function AppSplash() {
  return (
    <div id="kova-splash" aria-hidden="true">
      <div
        className="kova-splash-mark"
        dangerouslySetInnerHTML={{ __html: MARK_SVG }}
      />
    </div>
  );
}
