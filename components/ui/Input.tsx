import { cn } from "@/lib/utils";

const baseField =
  "w-full rounded-lg border border-border-strong bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-[rgba(255,255,255,0.28)] focus:outline-none";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(baseField, className)} {...props} />;
}

export function Select({
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(baseField, "appearance-none", className)} {...props} />;
}

/** Labeled field wrapper — small uppercase label above a control. */
export function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="metric-label">{label}</span>
      {children}
    </label>
  );
}
