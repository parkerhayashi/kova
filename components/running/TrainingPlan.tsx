"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
  deleteTrainingPlanRunAction,
  moveTrainingPlanRunAction,
} from "@/app/(dashboard)/running/actions";
import { FormError, PlanRunForm, useRunAction } from "@/components/running/RunForms";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { TrainingPlanView } from "@/lib/data/running";
import { formatDistance, formatRunDuration, runTypeLabel } from "@/lib/run-fuel";
import { formatIsoDateLabel } from "@/lib/utils";
import type { TrainingPlanRun } from "@/types";

function planRunLabel(run: TrainingPlanRun): string {
  const parts = [runTypeLabel(run.run_type)];
  if (run.distance_km != null) parts.push(formatDistance(run.distance_km));
  else if (run.duration_min != null) parts.push(formatRunDuration(run.duration_min));
  return parts.join(" · ");
}

/**
 * What to run next — type + mileage, no date. Logging a run completes it.
 * Putting it on the calendar (day detail) is what enrolls it in nutrition.
 */
export function NextRunCard({ plan }: { plan: TrainingPlanView }) {
  const [editing, setEditing] = useState(false);
  const next = plan.next;
  const last = plan.completed[0];

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="metric-label">Next run</span>
        <Button type="button" variant="ghost" className="py-1.5" onClick={() => setEditing((v) => !v)}>
          {editing ? "Done" : "Edit plan"}
        </Button>
      </div>
      {next ? (
        <div>
          <p className="metric-value">{planRunLabel(next)}</p>
          {next.notes ? <p className="text-text-secondary mt-1 text-sm">{next.notes}</p> : null}
        </div>
      ) : (
        <p className="text-text-muted text-sm">
          The plan is empty. Add runs below, or ask Muse to fill it in.
        </p>
      )}
      <p className="text-text-muted text-xs">
        {plan.upcoming.length > 1
          ? `Then: ${plan.upcoming
              .slice(1, 4)
              .map(planRunLabel)
              .join(", ")}${plan.upcoming.length > 4 ? ` +${plan.upcoming.length - 4} more` : ""}. `
          : ""}
        {last?.completed_at
          ? `Last done: ${planRunLabel(last)} (${formatIsoDateLabel(last.completed_at.slice(0, 10), { month: "short", day: "numeric" })}). `
          : ""}
        Logging a run completes the next one. Add it to the calendar to plan its fuel.
      </p>
      {editing ? <PlanEditor upcoming={plan.upcoming} /> : null}
    </Card>
  );
}

function PlanEditor({ upcoming }: { upcoming: TrainingPlanRun[] }) {
  const { pending, error, run } = useRunAction();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(upcoming.length === 0);

  return (
    <div className="border-border space-y-2 border-t pt-3">
      {upcoming.map((item, i) =>
        editingId === item.id ? (
          <PlanRunForm key={item.id} initial={item} onDone={() => setEditingId(null)} />
        ) : (
          <div
            key={item.id}
            className="border-border flex items-center justify-between gap-2 rounded-xl border px-3 py-2"
          >
            <button
              type="button"
              className="min-w-0 text-left"
              onClick={() => setEditingId(item.id)}
            >
              <p className="text-sm font-semibold">
                <span className="text-text-muted mr-2 tabular-nums">{i + 1}.</span>
                {planRunLabel(item)}
              </p>
              {item.notes ? <p className="text-text-muted truncate text-xs">{item.notes}</p> : null}
            </button>
            <div className="flex shrink-0 items-center">
              {[
                { dir: "up" as const, Icon: ChevronUp, disabled: i === 0 },
                { dir: "down" as const, Icon: ChevronDown, disabled: i === upcoming.length - 1 },
              ].map(({ dir, Icon, disabled }) => (
                <button
                  key={dir}
                  type="button"
                  aria-label={`Move ${dir}`}
                  disabled={pending || disabled}
                  onClick={() => run(() => moveTrainingPlanRunAction(item.id, dir))}
                  className="text-text-muted hover:text-text-primary flex size-8 items-center justify-center rounded-lg hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-30"
                >
                  <Icon className="size-4" />
                </button>
              ))}
              <button
                type="button"
                aria-label="Remove from plan"
                disabled={pending}
                onClick={() => run(() => deleteTrainingPlanRunAction(item.id))}
                className="text-text-muted hover:text-text-primary flex size-8 items-center justify-center rounded-lg hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        ),
      )}
      {adding ? (
        <PlanRunForm onDone={() => setAdding(false)} />
      ) : (
        <Button type="button" variant="ghost" onClick={() => setAdding(true)}>
          Add run to plan
        </Button>
      )}
      <FormError error={error} />
    </div>
  );
}
