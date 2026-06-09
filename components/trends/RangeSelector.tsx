"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { TrendRange } from "@/lib/trends/types";
import { cn } from "@/lib/utils";

const RANGES: TrendRange[] = [7, 30, 90];

export function RangeSelector({ active }: { active: TrendRange }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex gap-1 rounded-lg border border-border p-1">
      {RANGES.map((days) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("days", String(days));
        const href = `${pathname}?${params.toString()}`;
        return (
          <Link
            key={days}
            href={href}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active === days
                ? "bg-[rgba(255,255,255,0.08)] text-text-primary"
                : "text-text-muted hover:text-text-secondary",
            )}
          >
            {days}d
          </Link>
        );
      })}
    </div>
  );
}
