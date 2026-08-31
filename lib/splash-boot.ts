import { readFileSync } from "fs";
import { join } from "path";

/** Wordmark SVG markup for the launch splash (server-only read). */
export function getSplashWordmarkSvg(): string {
  return readFileSync(
    join(process.cwd(), "public/brand/kova-wordmark-white.svg"),
    "utf8",
  ).replace(/<\?xml[^?]*\?>\s*/i, "");
}
