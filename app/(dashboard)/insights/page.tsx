import { PageHeader } from "@/components/PageHeader";
import { InsightCard } from "@/components/insights/InsightCard";
import { WeeklyReportCard } from "@/components/insights/WeeklyReportCard";
import { getInsights } from "@/lib/data/insights";
import { mondayOf } from "@/lib/plan-engine";
import { normalizeIsoDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Insights — the weekly report and how nutrition ties into recovery and performance. */
export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const data = await getInsights(normalizeIsoDate(week ?? "") ?? undefined);
  const thisWeek = mondayOf(data.today);
  const warnings = data.insights.filter((i) => i.status === "warning");
  const rest = data.insights.filter((i) => i.status !== "warning");

  return (
    <div className="space-y-6">
      <PageHeader title="Insights" subtitle="Your week in review, and how food ties into recovery and performance." />

      <WeeklyReportCard report={data.report} thisWeek={thisWeek} />
      {data.previous ? <WeeklyReportCard report={data.previous} thisWeek={thisWeek} /> : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-text-primary text-base font-semibold">Nutrition × performance</h2>
          <p className="text-text-muted text-xs">Patterns in your own data over the last 90 days. Correlation, not proof — they firm up as data piles up.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {[...warnings, ...rest].map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
      </section>
    </div>
  );
}
