import { cn } from "@/lib/utils";

type Variant = "primary" | "solid" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "btn-primary",
  solid:
    "border border-border bg-[rgba(255,255,255,0.04)] text-text-primary hover:bg-[rgba(255,255,255,0.10)]",
  ghost:
    "border border-border-strong text-text-secondary hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]",
  danger:
    "border border-border-strong text-text-muted hover:text-[color:var(--color-stress)] hover:border-[color:var(--color-stress)]",
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

/** Button — Coach-style chrome. Primary uses white gradient; accents stay on data. */
export function Button({
  variant = "solid",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        VARIANTS[variant],
        className,
      )}
      {...props}
    />
  );
}
