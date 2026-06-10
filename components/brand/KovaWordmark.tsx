import { cn } from "@/lib/utils";

interface KovaWordmarkProps {
  variant?: "white" | "black";
  className?: string;
  height?: number;
}

/** Brand wordmark — use vector file directly; never re-type "Kova" in another font. */
export function KovaWordmark({
  variant = "white",
  className,
  height = 28,
}: KovaWordmarkProps) {
  const src =
    variant === "white"
      ? "/brand/kova-wordmark-white.svg"
      : "/brand/kova-wordmark-black.svg";

  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand SVG wordmark
    <img
      src={src}
      alt="Kova"
      height={height}
      className={cn("w-auto", className)}
      style={{ height }}
    />
  );
}
