"use client";

import { Crown, Medal, Trophy } from "lucide-react";
import type { SetPRFlags } from "@/lib/workouts";
import { cn } from "@/lib/utils";

export function SetPrBadges({
  pr,
  pop = false,
  className,
}: {
  pr: SetPRFlags;
  pop?: boolean;
  className?: string;
}) {
  const items: { key: keyof SetPRFlags; icon: typeof Crown; label: string }[] = [];
  if (pr.heaviest_weight) items.push({ key: "heaviest_weight", icon: Crown, label: "Heaviest weight PR" });
  if (pr.best_est_1rm) items.push({ key: "best_est_1rm", icon: Trophy, label: "Est. 1RM PR" });
  if (pr.best_set_volume) items.push({ key: "best_set_volume", icon: Medal, label: "Set volume PR" });
  if (pr.rep_record) items.push({ key: "rep_record", icon: Medal, label: "Rep record PR" });

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "flex items-center gap-1",
        pop && "animate-[pr-pop_0.55s_ease-out]",
        className,
      )}
    >
      {items.map(({ key, icon: Icon, label }) => (
        <span
          key={key}
          title={label}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(255,255,255,0.08)] text-[color:var(--color-activity)]"
        >
          <Icon size={12} strokeWidth={2.25} aria-hidden />
          <span className="sr-only">{label}</span>
        </span>
      ))}
    </div>
  );
}
