import type { Exercise, SessionExerciseView } from "@/types";

const CATEGORY_LABELS: Record<string, string> = {
  back: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  legs: "Legs",
  arms: "Arms",
  core: "Core",
};

const CATEGORY_MUSCLES: Record<
  string,
  { primary: string; secondary: string[] }
> = {
  back: { primary: "Lats", secondary: ["Upper back", "Biceps", "Forearms"] },
  chest: { primary: "Chest", secondary: ["Shoulders", "Triceps"] },
  shoulders: { primary: "Shoulders", secondary: ["Traps", "Triceps"] },
  legs: { primary: "Quads", secondary: ["Glutes", "Hamstrings", "Calves"] },
  arms: { primary: "Biceps", secondary: ["Triceps", "Forearms"] },
  core: { primary: "Abs", secondary: ["Obliques", "Hip flexors"] },
};

const CATEGORY_EMOJI: Record<string, string> = {
  back: "🔙",
  chest: "💪",
  shoulders: "🏋️",
  legs: "🦵",
  arms: "💪",
  core: "🎯",
};

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return "General";
  return CATEGORY_LABELS[category] ?? category;
}

export function exerciseMuscles(exercise: Pick<Exercise, "category">): {
  primary: string;
  secondary: string[];
} {
  const cat = exercise.category ?? "back";
  return (
    CATEGORY_MUSCLES[cat] ?? {
      primary: categoryLabel(cat),
      secondary: [],
    }
  );
}

export function exerciseThumbGlyph(exercise: Pick<Exercise, "category" | "name">): string {
  const cat = exercise.category ?? "";
  return CATEGORY_EMOJI[cat] ?? exercise.name.charAt(0).toUpperCase();
}

export function collectWorkoutMuscleCategories(
  exercises: SessionExerciseView[],
): string[] {
  const cats = new Set<string>();
  for (const ex of exercises) {
    if (ex.exercise.category) cats.add(ex.exercise.category);
  }
  return [...cats];
}

export function formatHistoryDate(date: string, completedAt?: string | null): string {
  const iso = completedAt ?? `${date}T12:00:00`;
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const PROGRESS_METRICS = [
  { id: "heaviest" as const, label: "Heaviest weight" },
  { id: "est_1rm" as const, label: "One rep max" },
  { id: "set_volume" as const, label: "Best set volume" },
];

export const PROGRESS_PERIODS = [
  { days: 30, label: "Last month" },
  { days: 90, label: "Last 3 months" },
  { days: 180, label: "Last 6 months" },
  { days: 365, label: "Last year" },
];
