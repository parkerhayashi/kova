import { Suspense } from "react";
import { LogDatePicker } from "@/components/LogDatePicker";
import { WaterApp } from "@/components/water/WaterApp";
import { getTimezone } from "@/lib/data/oura";
import { parseLogDate } from "@/lib/log-date";
import { todayInTimezone } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function WaterPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const { date: dateParam } = await searchParams;
  const timezone = await getTimezone();
  const today = todayInTimezone(timezone);
  const logDate = parseLogDate(dateParam, today);

  return (
    <WaterApp
      key={logDate}
      logDate={logDate}
      today={today}
      timezone={timezone}
      datePicker={
        <Suspense fallback={null}>
          <LogDatePicker selected={logDate} today={today} timezone={timezone} />
        </Suspense>
      }
    />
  );
}
