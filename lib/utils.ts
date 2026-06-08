/** Tiny className combiner — no dependency needed for this app's scale. */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

/** Map a Kova semantic accent name to its CSS color token. */
export type Accent =
  | "recovery"
  | "sleep"
  | "activity"
  | "stress"
  | "nutrition";

export const accentColor: Record<Accent, string> = {
  recovery: "var(--color-recovery)",
  sleep: "var(--color-sleep)",
  activity: "var(--color-activity)",
  stress: "var(--color-stress)",
  nutrition: "var(--color-nutrition)",
};
