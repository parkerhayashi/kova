import { CutStatusCoach } from "@/components/home/CutStatusCoach";
import { getCutCoachDaily } from "@/lib/data/cut-coach";

export async function CutStatusCoachLoader() {
  const { daily, aiConfigured } = await getCutCoachDaily();
  return <CutStatusCoach daily={daily} aiConfigured={aiConfigured} />;
}

export function CutStatusCoachFallback() {
  return (
    <section className="cut-coach-section section">
      <h2 className="section-title">Coach</h2>
      <div className="dash-card cut-coach-loading">Loading coach…</div>
    </section>
  );
}
