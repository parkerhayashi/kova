import { museJson } from "@/lib/muse/auth";
import { readMuseToday } from "@/lib/muse/read";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  return museJson(request, readMuseToday);
}
