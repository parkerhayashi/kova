import Link from "next/link";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { fmtNutrient, macroCalories, type DailyTotals, type NutritionGoals } from "@/lib/nutrition";
import { burnSourceLabel, type NutritionGoalMeta } from "@/lib/nutrition-goals";

export function MacroSummary({
  totals,
  goals,
  meta,
}: {
  totals: DailyTotals;
  goals: NutritionGoals;
  meta?: NutritionGoalMeta;
}) {
  const calories = totals.calories ?? 0;
  const macros = macroCalories(totals);
  const macroTotal = macros.protein + macros.carbs + macros.fat || 1;

  return (
    <section className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Calories"
          value={Math.round(calories)}
          unit={`/ ${goals.calories}`}
          accent="nutrition"
          caption={
            calories >= goals.calories * 0.9
              ? "Near goal"
              : `${Math.round(goals.calories - calories)} to go`
          }
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
            {meta.oura_burn} kcal {burnSourceLabel(meta.burn_source).toLowerCase()}
            {meta.calorie_adjustment !== 0
              ? ` · ${meta.calorie_adjustment > 0 ? "+" : ""}${meta.calorie_adjustment} kcal`
              : ""}
            {meta.adjustment_reason ? ` (${meta.adjustment_reason})` : ""}
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

      <Link href="/water" className="block">
        <Card className="card-interactive flex items-center justify-between gap-3">
          <div>
            <span className="metric-label">Hydration</span>
            <p className="body-copy text-sm">Water tracking lives on its own page.</p>
          </div>
          <span className="text-text-muted text-sm">Open →</span>
        </Card>
      </Link>
    </section>
  );
}
