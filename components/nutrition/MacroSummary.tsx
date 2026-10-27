import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { fmtNutrient, macroCalories, type DailyTotals, type NutritionGoals } from "@/lib/nutrition";
import { maintenanceSourceLabel, type NutritionGoalMeta } from "@/lib/nutrition-goals";

export function MacroSummary({
  totals,
  goals,
  meta,
  alcoholCalories = 0,
}: {
  totals: DailyTotals;
  goals: NutritionGoals;
  meta?: NutritionGoalMeta;
  alcoholCalories?: number;
}) {
  const calories = totals.calories ?? 0;
  const macros = macroCalories(totals);
  const macroTotal = macros.protein + macros.carbs + macros.fat || 1;
  const calorieCaption =
    alcoholCalories > 0
      ? `incl. ${alcoholCalories} kcal alcohol`
      : calories >= goals.calories * 0.9
        ? "Near goal"
        : `${Math.round(goals.calories - calories)} to go`;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Calories"
          value={Math.round(calories)}
          unit={`/ ${goals.calories}`}
          accent="nutrition"
          caption={calorieCaption}
        />
        <MetricCard
          label="Protein"
          value={Math.round(totals.protein_g ?? 0)}
          unit={`/ ${goals.protein_g}g`}
          accent="nutrition"
        />
        <MetricCard
          label="Carbs"
          value={Math.round(totals.carbs_g ?? 0)}
          unit={`/ ${goals.carbs_g}g`}
          accent="activity"
        />
        <MetricCard
          label="Fat"
          value={Math.round(totals.fat_g ?? 0)}
          unit={`/ ${goals.fat_g}g`}
          accent="stress"
        />
      </div>

      {meta ? (
        <Card className="space-y-1">
          <span className="metric-label">How today&apos;s goal is calculated</span>
          <p className="text-text-muted text-xs">
            {meta.maintenance_calories} kcal{" "}
            {maintenanceSourceLabel(meta.maintenance_source).toLowerCase()}
            {meta.adaptive_adjustment !== 0
              ? ` · ${meta.adaptive_adjustment > 0 ? "+" : ""}${meta.adaptive_adjustment} kcal from intake/weight`
              : ""}
            {meta.calorie_adjustment !== 0
              ? ` · ${meta.calorie_adjustment > 0 ? "+" : ""}${meta.calorie_adjustment} kcal goal adjustment`
              : ""}
            {meta.diet_break_active
              ? " · diet break (at maintenance)"
              : meta.reverse_diet_active
                ? ` · reverse diet (+${meta.reverse_diet_added_kcal} kcal ramped)`
                : ""}
            {meta.adjustment_reason ? ` (${meta.adjustment_reason})` : ""}
            {meta.adaptive_reason && meta.adaptive_adjustment !== 0
              ? ` · ${meta.adaptive_reason}`
              : ""}
            {meta.run_day?.fuel
              ? meta.run_day.fuel.kind === "carb_load"
                ? ` · carb-load day (${meta.run_day.fuel.added_kcal > 0 ? "+" : ""}${meta.run_day.fuel.added_kcal} kcal, outside the cut)`
                : ` · +${meta.run_day.fuel.added_kcal} kcal run fuel (${meta.run_day.fuel.basis === "actual" ? "actual" : "estimated"})`
              : ""}
            {" · "}
            protein from lean mass
          </p>
        </Card>
      ) : null}

      <Card className="space-y-3">
        <span className="metric-label">Macro breakdown</span>
        <div className="flex h-2 overflow-hidden rounded-full">
          <div
            className="h-full"
            style={{
              width: `${(macros.protein / macroTotal) * 100}%`,
              background: "var(--color-nutrition)",
            }}
          />
          <div
            className="h-full"
            style={{
              width: `${(macros.carbs / macroTotal) * 100}%`,
              background: "var(--color-activity)",
            }}
          />
          <div
            className="h-full"
            style={{
              width: `${(macros.fat / macroTotal) * 100}%`,
              background: "var(--color-stress)",
            }}
          />
        </div>
        <div className="text-text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span>
            Protein {fmtNutrient(totals.protein_g, "g")} ·{" "}
            {Math.round((macros.protein / macroTotal) * 100)}%
          </span>
          <span>
            Carbs {fmtNutrient(totals.carbs_g, "g")} ·{" "}
            {Math.round((macros.carbs / macroTotal) * 100)}%
          </span>
          <span>
            Fat {fmtNutrient(totals.fat_g, "g")} ·{" "}
            {Math.round((macros.fat / macroTotal) * 100)}%
          </span>
        </div>
      </Card>
    </section>
  );
}
