"use client";

import { cn } from "@/lib/utils";
import { exerciseThumbGlyph } from "@/lib/exercise-display";
import type { Exercise } from "@/types";

export function ExerciseThumb({
  exercise,
  size = "md",
  className,
}: {
  exercise: Pick<Exercise, "category" | "name">;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "h-9 w-9 text-sm",
    md: "h-11 w-11 text-base",
    lg: "h-24 w-24 text-3xl",
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border border-border bg-[rgba(255,255,255,0.04)]",
        sizes[size],
        className,
      )}
      aria-hidden
    >
      {exerciseThumbGlyph(exercise)}
    </div>
  );
}
