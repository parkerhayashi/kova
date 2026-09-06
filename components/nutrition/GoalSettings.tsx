"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import {
  bumpReverseDietAction,
  resetAdaptiveTdee,
  saveNutritionTargets,
  startReverseDietAction,
  stopReverseDietAction,
} from "@/app/(dashboard)/nutrition/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import type { ComputedNutritionGoals } from "@/lib/nutrition-goals";
import {
  activityLevelLabel,
  bmrFormulaLabel,
} from "@/lib/nutrition-goals";
import type { ReverseDietView } from "@/lib/reverse-diet";

export function GoalSettings({
  goals,
  reverse,
}: {
  goals: ComputedNutritionGoals;
  reverse: ReverseDietView;
}) {
  const { meta } = goals;
  const [open, setOpen] = useState(false);
  const [weightGoal, setWeightGoal] = useState(
    meta.weight_goal_lbs != null ? String(meta.weight_goal_lbs) : "",
  );
  const [bodyFatGoal, setBodyFatGoal] = useState(
    meta.body_fat_goal_pct != null ? String(meta.body_fat_goal_pct) : "",
  );
  const [saved, setSaved] = useState(false);
  const [reset, setReset] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resetPending, startResetTransition] = useTransition();
  const [reversePending, startReverseTransition] = useTransition();

  function handleResetTdee() {
    startResetTransition(async () => {
      await resetAdaptiveTdee();
      setReset(true);
      setTimeout(() => setReset(false), 2000);
    });
  }

  const hasAdaptiveNudge = meta.adaptive_adjustment !== 0;

  function handleSave() {
    startTransition(async () => {
      await saveNutritionTargets({
        weight_goal_lbs: weightGoal.trim() ? Number(weightGoal) : null,
        body_fat_goal_pct: bodyFatGoal.trim() ? Number(bodyFatGoal) : null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  function flash(msg: string) {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2500);
  }

  function handleStartReverse() {
    startReverseTransition(async () => {
      try {
        await startReverseDietAction();
        flash("Reverse diet started");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Could not start");
      }
    });
  }

  function handleStopReverse() {
    startReverseTransition(async () => {
      await stopReverseDietAction();
      flash("Reverse diet ended");
    });
  }

  function handleBumpReverse() {
    startReverseTransition(async () => {
      try {
        await bumpReverseDietAction();
        flash("Added +100 kcal");
      } catch (err) {
        flash(err instanceof Error ? err.message : "Could not bump");
      }
    });
  }

  const currentWeight =
    meta.current_weight_lbs != null
      ? `${Math.round(meta.current_weight_lbs * 10) / 10} lb`
      : "—";
  const currentBodyFat =
    meta.current_body_fat_pct != null
      ? `${Math.round(meta.current_body_fat_pct * 10) / 10}%`
      : "estimated from sex";

  const summaryParts = [
    `${goals.calories} kcal`,
    `${goals.protein_g}g protein`,
    reverse.active
      ? "reverse diet"
      : meta.weight_goal_lbs != null
        ? `→ ${meta.weight_goal_lbs} lb`
        : null,
  ].filter(Boolean);

  return (
    <Card className="space-y-0">
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="min-w-0 flex-1">
          <span className="metric-label">Daily targets</span>
          <p className="text-text-muted mt-1 truncate text-sm">
            {summaryParts.join(" · ")}
          </p>
        </div>
        <ChevronDown
          className={`text-text-muted size-4 shrink-0 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open ? (
        <div className="border-border mt-4 space-y-4 border-t pt-4">
          <p className="body-copy text-sm">
            Calories and macros derive from your weight, lean mass, TDEE estimate,
            small intake/weight nudges, and the goals below. Reverse diet overrides
            the cut deficit and climbs calories weekly until weight stabilizes.
          </p>

          <div className="rounded-xl bg-[rgba(255,255,255,0.03)] px-3 py-3 space-y-2">
            <span className="metric-label">Reverse diet</span>
            <p className="text-sm font-semibold text-text-primary">
              {reverse.headline}
            </p>
            <p className="text-text-muted text-xs">{reverse.detail}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {reverse.active ? (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleBumpReverse}
                    disabled={reversePending}
                  >
                    Bump +{reverse.state?.step_kcal ?? 100} now
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleStopReverse}
                    disabled={reversePending}
                  >
                    End reverse
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  onClick={handleStartReverse}
                  disabled={reversePending}
                >
                  {reversePending ? "Starting…" : "Start reverse diet"}
                </Button>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Weight goal (lb)">
              <Input
                type="number"
                step="0.5"
                inputMode="decimal"
                placeholder="e.g. 175"
                value={weightGoal}
                onChange={(e) => setWeightGoal(e.target.value)}
                disabled={reverse.active}
              />
            </Field>
            <Field label="Body fat goal (%)">
              <Input
                type="number"
                step="0.1"
                inputMode="decimal"
                placeholder="e.g. 15"
                value={bodyFatGoal}
                onChange={(e) => setBodyFatGoal(e.target.value)}
                disabled={reverse.active}
              />
            </Field>
          </div>

          <div className="text-text-muted space-y-1 text-xs">
            <p>
              Current: {currentWeight}
              {meta.current_body_fat_pct != null
                ? ` · ${currentBodyFat} body fat`
                : ` · ${currentBodyFat}`}
            </p>
            <p>
              BMR {meta.bmr} kcal ({bmrFormulaLabel(meta.bmr_formula)}) · TDEE{" "}
              {meta.tdee_calories} kcal ({activityLevelLabel(meta.activity_level)}{" "}
              ×{meta.activity_multiplier})
              {meta.adaptive_adjustment !== 0
                ? ` · ${meta.adaptive_adjustment > 0 ? "+" : ""}${meta.adaptive_adjustment} from intake/weight`
                : ""}
              {meta.calorie_adjustment !== 0
                ? ` · ${meta.calorie_adjustment > 0 ? "+" : ""}${meta.calorie_adjustment} goal adjustment`
                : ""}
            </p>
            {meta.adaptive_reason ? (
              <p style={{ color: "var(--color-nutrition)" }}>{meta.adaptive_reason}</p>
            ) : null}
            {meta.adjustment_reason ? (
              <p style={{ color: "var(--color-nutrition)" }}>{meta.adjustment_reason}</p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              onClick={handleSave}
              disabled={pending || reverse.active}
            >
              {pending ? "Saving…" : "Save goals"}
            </Button>
            {hasAdaptiveNudge ? (
              <Button
                type="button"
                variant="ghost"
                onClick={handleResetTdee}
                disabled={resetPending}
              >
                {resetPending ? "Resetting…" : "Reset TDEE nudge"}
              </Button>
            ) : null}
            {saved ? <span className="timestamp">Saved</span> : null}
            {reset ? <span className="timestamp">TDEE nudge reset</span> : null}
            {message ? <span className="timestamp">{message}</span> : null}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
