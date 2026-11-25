import { PageHeader } from "@/components/PageHeader";
import { InjuryCard, InjuryLog } from "@/components/injuries/InjuryLog";
import { getInjuries } from "@/lib/data/injuries";
import { getTimezone } from "@/lib/data/oura";
import { todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Injuries & pain — logged here, they lower Recovery and (with the plan) adjust training. */
export default async function InjuriesPage() {
  const [all, timezone] = await Promise.all([getInjuries(true), getTimezone()]);
  const today = todayInTimezone(timezone);
  const active = all.filter((v) => v.injury.status !== "resolved");
  const resolved = all.filter((v) => v.injury.status === "resolved");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Injuries & Pain"
        subtitle="Log what hurts and check in daily — it lowers Recovery and shapes training."
      />
      <InjuryLog active={active} today={today} />
      {resolved.length > 0 ? (
        <details className="card">
          <summary className="text-text-secondary hover:text-text-primary cursor-pointer text-sm">
            Resolved ({resolved.length})
          </summary>
          <div className="mt-4 space-y-3">
            {resolved.map((v) => (
              <InjuryCard key={v.injury.id} view={v} today={today} />
            ))}
          </div>
        </details>
      ) : null}
      <p className="text-text-muted text-xs">
        Kova adjusts training around what you log, but it isn&apos;t medical advice. Swelling, pain at
        rest, numbness, pain that keeps getting worse, or not being able to bear weight — see a
        physio or doctor.
      </p>
    </div>
  );
}
