import { cn } from "@/lib/utils";

/**
 * Card — surface panel. 0.5px border, 12px radius, #161616 bg (blueprint §4).
 * No colored chrome; accents live on the data inside.
 */
export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card p-5", className)} {...props}>
      {children}
    </div>
  );
}
