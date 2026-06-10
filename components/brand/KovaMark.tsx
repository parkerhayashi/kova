import { cn } from "@/lib/utils";

interface KovaMarkProps {
  variant?: "white" | "black";
  className?: string;
  size?: number;
}

/** Brand mark — app icons, avatars, tight spaces. Never pair with the wordmark. */
export function KovaMark({
  variant = "white",
  className,
  size = 32,
}: KovaMarkProps) {
  const src =
    variant === "white"
      ? "/brand/kova-mark-white.svg"
      : "/brand/kova-mark-black.svg";

  return (
    // eslint-disable-next-line @next/next/no-img-element -- brand SVG mark
    <img
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={cn("shrink-0", className)}
      style={{ width: size, height: size }}
    />
  );
}
