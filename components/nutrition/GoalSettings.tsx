"use client";

import { useState, useTransition } from "react";
import { resetAdaptiveTdee, saveNutritionTargets } from "@/app/(dashboard)/nutrition/actions";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import {
  type ComputedNutritionGoals,
} from "@/lib/nutrition-goals";

export function GoalSettings({ goals }: { goals: ComputedNutritionGoals }) {
  const { meta } = goals;
  const [weightGoal, setWeightGoal] = useState(
    meta.weight_goal_lbs != null ? String(meta.weight_goal_lbs) : "",
  );
  const [bodyFatGoal, setBodyFatGoal] = useState(
    meta.body_fat_goal_pct != null ? String(meta.body_fat_goal_pct) : "",
  );
  const [saved, setSaved] = useState(false);
  const [reset, setReset] = useState(false);
  const [pending, startTransition] = useTransition();
  const [resetPending, startResetTransition] = useTransition();

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

  const currentWeight =
    meta.current_weight_lbs != null
      ? `${Math.round(meta.current_weight_lbs * 10) / 10} lb`
      : "—";
  const currentBodyFat =
    meta.current_body_fat_pct != null
      ? `${Math.round(meta.current_body_fat_pct * 10) / 10}%`
      : "estimated from sex";

  return (
    <Card className="space-y-4">
      <div>
        <span className="metric-label">Daily targets</span>
        <p className="body-copy mt-1 text-sm">
          Calories and macros derive from your weight, lean mass, TDEE estimate,
          small intake/weight nudges, and the goals below.
        </p>
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
          />
        </Field>
      </div>

      <div className="text-text-muted space-y-1 text-xs">
        <p>
          Current: {currentWeight}
          {meta.current_body_fat_pct != null ? ` · ${currentBodyFat} body fat` : ` · ${currentBodyFat}`}
        </p>
        <p>
          BMR {meta.bmr} kcal · TDEE {meta.tdee_calories} kcal
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
        <Button type="button" onClick={handleSave} disabled={pending}>
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
      </div>
    </Card>
  );
}
