import { Suspense } from "react";
import { PageHeader } from "@/components/PageHeader";
import { LogDatePicker } from "@/components/LogDatePicker";
import { BodyFatEstimate } from "@/components/weight/BodyFatEstimate";
import { CoachComposition } from "@/components/coach/CoachPanel";
import { WeightDayLog } from "@/components/weight/WeightDayLog";
import { WeightHistory } from "@/components/weight/WeightHistory";
import { WeightInsights } from "@/components/weight/WeightInsights";
import { getBodyFatEstimate } from "@/lib/data/body-fat";
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

  const [weight, weightHistory, settings, bodyFat] = await Promise.all([
    getWeightForDate(logDate),
    getAllWeightLogs(),
    getUserSettings(),
    getBodyFatEstimate(),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Weight"
          subtitle="Weigh-ins, body fat estimate, pace, and history."
        />
        <Suspense fallback={null}>
          <LogDatePicker selected={logDate} today={today} timezone={timezone} />
        </Suspense>
      </div>

      <WeightDayLog
        key={logDate}
        logDate={logDate}
        today={today}
        timezone={timezone}
        initialWeightLbs={weight?.weight_lbs ?? null}
      />

      <BodyFatEstimate initial={bodyFat} />

      <WeightInsights
        logs={weightHistory}
        today={today}
        goalLbs={settings?.weight_goal_lbs ?? null}
      />

      <CoachComposition />

      <WeightHistory
        initialLogs={weightHistory}
        timezone={timezone}
        editPath="/weight"
      />
    </div>
  );
}
