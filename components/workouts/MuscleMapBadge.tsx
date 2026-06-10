"use client";

import { categoryLabel, collectWorkoutMuscleCategories } from "@/lib/exercise-display";
import type { SessionExerciseView } from "@/types";

export function MuscleMapBadge({
  exercises,
}: {
  exercises: SessionExerciseView[];
}) {
  const categories = collectWorkoutMuscleCategories(exercises);
  if (categories.length === 0) return null;

  return (
    <div
      className="flex items-center gap-1"
      title={categories.map(categoryLabel).join(", ")}
      aria-label={`Muscles: ${categories.map(categoryLabel).join(", ")}`}
    >
      {categories.slice(0, 4).map((cat) => (
        <span
          key={cat}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-[rgba(255,255,255,0.04)] text-[10px] font-semibold uppercase text-text-muted"
        >
          {categoryLabel(cat).slice(0, 2)}
        </span>
      ))}
    </div>
  );
}
