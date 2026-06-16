"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addDays } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Day selector for manual logs — persists in `?date=YYYY-MM-DD`. Omit the param
 * for today. No lower bound (unlimited past).
 */
export function LogDatePicker({
  selected,
  today,
  timezone,
}: {
  selected: string;
  today: string;
  timezone: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(date: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (date === today) params.delete("date");
    else params.set("date", date);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const label =
    selected === today
      ? "Today"
      : new Date(`${selected}T12:00:00`).toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          timeZone: timezone,
        });

  const canGoForward = selected < today;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="border-border flex items-center gap-0.5 rounded-lg border p-0.5">
        <button
          type="button"
          onClick={() => navigate(addDays(selected, -1))}
          aria-label="Previous day"
          className="text-text-muted hover:text-text-primary flex size-8 items-center justify-center rounded-md transition-colors hover:bg-[rgba(255,255,255,0.06)]"
        >
          <ChevronLeft className="size-4" strokeWidth={2} />
        </button>
        <label className="relative flex min-w-[9rem] items-center justify-center px-2 py-1.5">
          <span className="text-text-primary pointer-events-none text-sm font-medium">
            {label}
          </span>
          <input
            type="date"
            value={selected}
            max={today}
            onChange={(e) => {
              if (e.target.value) navigate(e.target.value);
            }}
            aria-label="Pick a date"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        <button
          type="button"
          onClick={() => navigate(addDays(selected, 1))}
          disabled={!canGoForward}
          aria-label="Next day"
          className={cn(
            "flex size-8 items-center justify-center rounded-md transition-colors",
            canGoForward
              ? "text-text-muted hover:text-text-primary hover:bg-[rgba(255,255,255,0.06)]"
              : "text-text-muted/30 cursor-not-allowed",
          )}
        >
          <ChevronRight className="size-4" strokeWidth={2} />
        </button>
      </div>
      {selected !== today ? (
        <button
          type="button"
          onClick={() => navigate(today)}
          className="text-text-secondary hover:text-text-primary rounded-lg border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[rgba(255,255,255,0.04)]"
        >
          Jump to today
        </button>
      ) : null}
    </div>
  );
}
