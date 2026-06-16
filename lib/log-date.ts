import { todayInTimezone } from "@/lib/utils";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse `?date=` for manual logging — unlimited past, never future. */
export function parseLogDate(
  input: string | undefined,
  today: string = todayInTimezone(),
): string {
  if (!input || !ISO_DATE.test(input)) return today;
  if (input > today) return today;
  return input;
}

export function logDateHeading(
  iso: string,
  today: string,
  timezone: string,
): string {
  if (iso === today) return "Today";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: iso.slice(0, 4) !== today.slice(0, 4) ? "numeric" : undefined,
    timeZone: timezone,
  });
}
