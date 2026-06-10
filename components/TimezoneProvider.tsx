import { TimezoneSync } from "@/components/TimezoneSync";
import { getTimezone } from "@/lib/data/oura";
import { DEFAULT_TIMEZONE } from "@/lib/utils";

/** Loads stored timezone without blocking the dashboard shell. */
export async function TimezoneProvider() {
  let timezone = DEFAULT_TIMEZONE;
  try {
    timezone = await getTimezone();
  } catch {
    /* fall back to default */
  }
  return <TimezoneSync current={timezone} />;
}
