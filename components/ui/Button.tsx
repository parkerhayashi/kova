import { cn } from "@/lib/utils";

type Variant = "solid" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  // Chrome only — monochrome, never an accent color (blueprint §4).
  solid:
    "bg-[rgba(255,255,255,0.10)] text-text-primary hover:bg-[rgba(255,255,255,0.16)]",
  ghost:
    "border border-border-strong text-text-secondary hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]",
  danger:
    "border border-border-strong text-text-muted hover:text-[color:var(--color-stress)] hover:border-[color:var(--color-stress)]",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Button — monochrome chrome with subtle hover. Accent stays on data only. */
export function Button({
  variant = "solid",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
