import { PageHeader } from "@/components/PageHeader";
import { PlannedList } from "@/components/PlannedList";

export default function NutritionPage() {
  return (
    <div>
      <PageHeader title="Nutrition" subtitle="Macros, micronutrients, and hydration." />
      <PlannedList
        phase="Phase 6"
        items={[
          "Daily calorie, macro, and micronutrient summary",
          "Meal log — food search via USDA FoodData Central",
          "Barcode scan via Open Food Facts (camera on PWA)",
          "Vitamin and mineral progress bars vs. daily RDA",
          "Fiber, sugar, sodium, potassium, omega-3, cholesterol tracking",
          "7-day calorie trend vs. goal · macro breakdown chart",
          "Water intake log with daily goal progress",
        ]}
      />
    </div>
  );
}
