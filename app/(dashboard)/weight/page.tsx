import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { LogDatePicker } from "@/components/LogDatePicker";
import { WeightDayLog } from "@/components/weight/WeightDayLog";
import { WeightHistory } from "@/components/weight/WeightHistory";
import { WeightInsights } from "@/components/weight/WeightInsights";
import { getTimezone, getUserSettings } from "@/lib/data/oura";
import { getAllWeightLogs, getWeightForDate } from "@/lib/data/tracking";
import { parseLogDate } from "@/lib/log-date";
import { todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WeightPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const logDate = parseLogDate(dateParam, today);

  const [weight, weightHistory, settings] = await Promise.all([
    getWeightForDate(logDate),
    getAllWeightLogs(),
    getUserSettings(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Weight"
          subtitle="Weigh-ins, weekly pace, and goal track."
        />
        <Suspense fallback={null}>
          <LogDatePicker selected={logDate} today={today} timezone={timezone} />
        </Suspense>
      </div>

      <WeightDayLog
        logDate={logDate}
        today={today}
        timezone={timezone}
        initialWeightLbs={weight?.weight_lbs ?? null}
      />

      <WeightInsights
        logs={weightHistory}
        today={today}
        goalLbs={settings?.weight_goal_lbs ?? null}
      />

      <WeightHistory
        initialLogs={weightHistory}
        timezone={timezone}
        editPath="/weight"
      />
    </div>
  );
}
