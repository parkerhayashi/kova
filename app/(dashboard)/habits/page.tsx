import { PageHeader } from "@/components/PageHeader";
import { MetricCard } from "@/components/MetricCard";
import { Card } from "@/components/ui/Card";
import { HabitChecklist, type HabitRow } from "@/components/habits/HabitChecklist";
import { HabitManager } from "@/components/habits/HabitManager";
import { Heatmap } from "@/components/habits/Heatmap";
import { getTimezone } from "@/lib/data/oura";
import { getHabitLogs, getHabits } from "@/lib/data/tracking";
import { addDays, currentStreak, todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  const [habits, logs, timezone] = await Promise.all([
    getHabits(true),
    getHabitLogs(180),
    getTimezone(),
  ]);
  const today = todayInTimezone(timezone);

  // Per-habit set of completed dates.
  const doneByHabit = new Map<string, Set<string>>();
  for (const h of habits) doneByHabit.set(h.id, new Set());
  for (const log of logs) {
    if (log.completed) doneByHabit.get(log.habit_id)?.add(log.date);
  }

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(today, -i));
  const rows: HabitRow[] = habits.map((h) => {
    const done = doneByHabit.get(h.id) ?? new Set<string>();
    const weekHits = last7.filter((d) => done.has(d)).length;
    return {
      id: h.id,
      name: h.name,
      completed: done.has(today),
      streak: currentStreak(done, today),
      weekRate: weekHits / 7,
    };
  });

  const doneToday = rows.filter((r) => r.completed).length;
  const bestStreak = rows.reduce((m, r) => Math.max(m, r.streak), 0);

  // Overall completion ratio per day for the heatmap.
  const completedByDate = new Map<string, number>();
  for (const log of logs) {
    if (log.completed)
      completedByDate.set(log.date, (completedByDate.get(log.date) ?? 0) + 1);
  }
  const denom = Math.max(1, habits.length);
  const ratios: Record<string, number> = {};
  for (const [date, count] of completedByDate)
    ratios[date] = Math.min(1, count / denom);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Habits"
        subtitle="Daily checklist with streaks and heatmap."
      />

      <section className="grid grid-cols-3 gap-3">
        <MetricCard
          label="Today"
          value={habits.length ? `${doneToday}/${habits.length}` : null}
          accent="recovery"
        />
        <MetricCard label="Best Streak" value={bestStreak || null} unit="d" accent="recovery" />
        <MetricCard
          label="Active"
          value={habits.length || null}
          accent="recovery"
        />
      </section>

      <HabitChecklist habits={rows} today={today} />

      {habits.length > 0 ? (
        <Card>
          <Heatmap ratios={ratios} today={today} label="Completion · 18 weeks" />
        </Card>
      ) : null}

      <HabitManager habits={habits} />
    </div>
  );
}
