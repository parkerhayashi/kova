import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { LogDatePicker } from "@/components/LogDatePicker";
import { MetricCard } from "@/components/MetricCard";
import {
  SupplementChecklist,
  type SupplementRow,
} from "@/components/supplements/SupplementChecklist";
import { SupplementManager } from "@/components/supplements/SupplementManager";
import { getTimezone } from "@/lib/data/oura";
import { getSupplementLogs, getSupplements } from "@/lib/data/tracking";
import { logDateHeading, parseLogDate } from "@/lib/log-date";
import { addDays, currentStreak, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SupplementsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const logDate = parseLogDate(dateParam, today);
  const dayLabel = logDateHeading(logDate, today, timezone);

  const [supplements, logs] = await Promise.all([
    getSupplements(true),
    getSupplementLogs(30, timezone),
  ]);
  const cutoff30 = addDays(today, -29);

  const takenDates = new Map<string, Set<string>>();
  const dayLog = new Map<string, (typeof logs)[number]>();
  for (const s of supplements) takenDates.set(s.id, new Set());
  for (const log of logs) {
    if (log.taken) takenDates.get(log.supplement_id)?.add(log.date);
    if (log.date === logDate) dayLog.set(log.supplement_id, log);
  }

  const rows: SupplementRow[] = supplements.map((s) => {
    const dates = takenDates.get(s.id) ?? new Set<string>();
    const taken30 = [...dates].filter((d) => d >= cutoff30).length;
    const log = dayLog.get(s.id);
    return {
      id: s.id,
      name: s.name,
      unit: s.unit,
      defaultDose: s.default_dose,
      taken: log?.taken ?? false,
      doseTaken: log?.dose_taken ?? null,
      timeTaken: log?.time_taken ?? null,
      notes: log?.notes ?? null,
      streak: currentStreak(dates, today),
      rate30: taken30 / 30,
    };
  });

  const takenCount = rows.filter((r) => r.taken).length;
  const bestStreak = rows.reduce((m, r) => Math.max(m, r.streak), 0);
  const avgAdherence =
    rows.length > 0
      ? Math.round((rows.reduce((sum, r) => sum + r.rate30, 0) / rows.length) * 100)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader title="Supplements" subtitle="Daily checklist and adherence." />
        <Suspense fallback={null}>
          <LogDatePicker selected={logDate} today={today} timezone={timezone} />
        </Suspense>
      </div>

      <section className="grid grid-cols-3 gap-3">
        <MetricCard
          label={logDate === today ? "Today" : "Taken"}
          value={supplements.length ? `${takenCount}/${supplements.length}` : null}
          caption={logDate === today ? undefined : dayLabel}
          accent="nutrition"
        />
        <MetricCard
          label="Best Streak"
          value={bestStreak || null}
          unit="d"
          accent="nutrition"
        />
        <MetricCard
          label="30-Day Adherence"
          value={avgAdherence}
          unit="%"
          accent="nutrition"
        />
      </section>

      <SupplementChecklist key={logDate} supplements={rows} logDate={logDate} />

      <SupplementManager supplements={supplements} />
    </div>
  );
}
