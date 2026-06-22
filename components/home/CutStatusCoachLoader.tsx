import { CutStatusCoach } from "@/components/home/CutStatusCoach";
import { getCutCoachBundle } from "@/lib/data/cut-coach";

export async function CutStatusCoachLoader() {
  const bundle = await getCutCoachBundle();

  return (
    <CutStatusCoach
      daily={bundle.daily}
      weekly={bundle.weekly}
      aiConfigured={bundle.aiConfigured}
    />
  );
}

export function CutStatusCoachFallback() {
  return (
    <section className="cut-coach-section section">
      <h2 className="section-title">Cut coach</h2>
      <div className="dash-card cut-coach-loading">Loading coach…</div>
    </section>
  );
}
