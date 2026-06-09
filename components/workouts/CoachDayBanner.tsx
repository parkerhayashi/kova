"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { readTodaySplit } from "@/lib/coach-bridge";
import { formatSplitLabel, isRestSplit } from "@/lib/coach-rx";
import type { RoutineDetail } from "@/types";

export function CoachDayBanner({
  routines,
  onStartRoutine,
}: {
  routines: RoutineDetail[];
  onStartRoutine: (routineId: string) => void;
}) {
  const [split, setSplit] = useState<{ name: string } | null>(null);

  useEffect(() => {
    setSplit(readTodaySplit());
  }, []);

  if (!split?.name) return null;

  const isRest = isRestSplit(split.name);
  const match = routines.find(
    (r) => r.name.toLowerCase() === split.name.toLowerCase(),
  );

  return (
    <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-border-strong">
      <div>
        <p className="metric-label">Coach split</p>
        <p className="text-lg font-semibold text-text-primary">
          {formatSplitLabel(split.name)}
        </p>
        <p className="mt-0.5 text-sm text-text-muted">
          {isRest
            ? "Rest day on your rotation — optional light work or skip."
            : match
              ? `${match.exercises.length} exercises · ${match.total_sets} sets · ~${match.estimated_minutes}m`
              : "Start the matching routine below."}
        </p>
      </div>
      {match && !isRest ? (
        <Button onClick={() => onStartRoutine(match.id)}>
          Start {match.name}
        </Button>
      ) : null}
    </Card>
  );
}
