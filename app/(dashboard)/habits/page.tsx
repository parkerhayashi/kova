import { Fragment, Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { LogDatePicker } from "@/components/LogDatePicker";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { HabitChecklist, type HabitRow } from "@/components/habits/HabitChecklist";
import { HabitManager } from "@/components/habits/HabitManager";
import { Heatmap } from "@/components/habits/Heatmap";
import { getTimezone } from "@/lib/data/oura";
import { getHabitLogs, getHabits } from "@/lib/data/tracking";
import { logDateHeading, parseLogDate } from "@/lib/log-date";
import { addDays, clearStreak, currentStreak, todayInTimezone } from "@/lib/utils";
import { normalizeDrinkCount } from "@/lib/habit-drinks";

export const dynamic = "force-dynamic";

export default async function HabitsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const logDate = parseLogDate(dateParam, today);
  const dayLabel = logDateHeading(logDate, today, timezone);

  const [habits, logs] = await Promise.all([
    getHabits(true),
    getHabitLogs(180, timezone),
  ]);

  const positiveHabits = habits.filter((h) => h.kind === "positive");
  const trackHabits = habits.filter((h) => h.kind === "track");

  const doneByHabit = new Map<string, Set<string>>();
  const logByHabitDate = new Map<string, { completed: boolean; drinkCount: number | null }>();
  for (const h of habits) doneByHabit.set(h.id, new Set());
  for (const log of logs) {
    if (log.completed) doneByHabit.get(log.habit_id)?.add(log.date);
    const drinkCount = normalizeDrinkCount(log.amount_tier);
    logByHabitDate.set(`${log.habit_id}:${log.date}`, {
      completed: log.completed,
      drinkCount,
    });
  }

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const rows: HabitRow[] = habits.map((h) => {
    const done = doneByHabit.get(h.id) ?? new Set<string>();
    const dayLog = logByHabitDate.get(`${h.id}:${logDate}`);
    const weekHits = last7.filter((d) => done.has(d)).length;
    const streak =
      h.kind === "track"
        ? clearStreak(done, today, h.created_at.slice(0, 10))
        : currentStreak(done, today);
    return {
      id: h.id,
      name: h.name,
      kind: h.kind ?? "positive",
      completed: dayLog?.completed ?? false,
      drinkCount: dayLog?.drinkCount ?? null,
      streak,
      weekRate: weekHits / 7,
    };
  });

  const positiveRows = rows.filter((r) => r.kind === "positive");
  const trackRows = rows.filter((r) => r.kind === "track");
  const habitsDone = positiveRows.filter((r) => r.completed).length;
  const tagsLogged = trackRows.filter((r) => r.completed).length;
  const bestStreak = rows.reduce((m, r) => Math.max(m, r.streak), 0);

  const completedByDate = new Map<string, number>();
  for (const log of logs) {
    if (!log.completed) continue;
    const habit = habits.find((h) => h.id === log.habit_id);
    if (habit?.kind !== "positive") continue;
    completedByDate.set(log.date, (completedByDate.get(log.date) ?? 0) + 1);
  }
  const denom = Math.max(1, positiveHabits.length);
  const ratios: Record<string, number> = {};
  for (const [date, count] of completedByDate)
    ratios[date] = Math.min(1, count / denom);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Habits"
          subtitle="Build habits and log day tags — alcohol, late meals, or anything worth noting."
        />
        <Suspense fallback={null}>
          <LogDatePicker selected={logDate} today={today} timezone={timezone} />
        </Suspense>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label={logDate === today ? "Habits today" : "Habits"}
          value={
            positiveHabits.length
              ? `${habitsDone}/${positiveHabits.length}`
              : null
          }
          caption={logDate === today ? undefined : dayLabel}
          accent="recovery"
        />
        <MetricCard
          label="Tags logged"
          value={trackHabits.length ? tagsLogged || null : null}
          unit={trackHabits.length ? `/${trackHabits.length}` : undefined}
          accent="stress"
          caption={
            trackHabits.length
              ? logDate === today
                ? "happened today"
                : dayLabel
              : "add day tags"
          }
        />
        <MetricCard label="Best streak" value={bestStreak || null} unit="d" accent="recovery" />
        <MetricCard
          label="Active"
          value={habits.length || null}
          caption={
            habits.length
              ? `${positiveHabits.length} habits · ${trackHabits.length} tags`
              : undefined
          }
          accent="recovery"
        />
      </section>

      <Fragment key={logDate}>
        <HabitChecklist habits={rows} logDate={logDate} />

        {positiveHabits.length > 0 ? (
          <Card>
            <Heatmap
              ratios={ratios}
              today={today}
              linkPath="/habits"
              label="Habit completion · 18 weeks (tap a day to edit)"
            />
          </Card>
        ) : null}
      </Fragment>

      <HabitManager habits={habits} />
    </div>
  );
}
