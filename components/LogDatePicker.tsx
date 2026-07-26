"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import { addDays, formatIsoDateLabel, normalizeIsoDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

/**
 * Day selector for manual logs — persists in `?date=YYYY-MM-DD`. Omit the param
 * for today. No lower bound (unlimited past).
 *
 * Native `<input type="date">` lives only behind the calendar icon (never over
 * the "Today" label). Spurious iOS onChange that flips today → yesterday is
 * ignored unless the input was opened intentionally.
 */
export function LogDatePicker({
  selected,
  today,
}: {
  selected: string;
  today: string;
  /** Kept for call-site compatibility; labels use calendar dates, not TZ. */
  timezone?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pickerOpenRef = useRef(false);

  function navigate(date: string) {
    const day = normalizeIsoDate(date);
    if (!day || day > today) return;
    const params = new URLSearchParams(searchParams.toString());
    if (day === today) params.delete("date");
    else params.set("date", day);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const label =
    selected === today ? "Today" : formatIsoDateLabel(selected);

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
        <span className="text-text-primary flex min-w-[9rem] items-center justify-center px-2 py-1.5 text-sm font-medium">
          {label}
        </span>
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
        <label className="border-border relative ml-0.5 flex size-8 cursor-pointer items-center justify-center rounded-md border-l border-border transition-colors hover:bg-[rgba(255,255,255,0.06)]">
          <Calendar className="text-text-muted size-3.5" strokeWidth={2} />
          <input
            type="date"
            value={selected}
            max={today}
            onFocus={() => {
              pickerOpenRef.current = true;
            }}
            onBlur={() => {
              // Delay so onChange can still see the intentional-open flag.
              window.setTimeout(() => {
                pickerOpenRef.current = false;
              }, 300);
            }}
            onChange={(e) => {
              const day = normalizeIsoDate(e.target.value);
              if (!day || day === selected) return;
              // Ignore ghost iOS events that fire without opening the picker
              // and flip "today" back one calendar day.
              if (
                !pickerOpenRef.current &&
                selected === today &&
                day === addDays(today, -1)
              ) {
                e.target.value = selected;
                return;
              }
              navigate(day);
            }}
            aria-label="Pick a date"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
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
