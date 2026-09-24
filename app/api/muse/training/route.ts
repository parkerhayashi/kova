import { type NextRequest } from "next/server";
import { clampDays, museJson } from "@/lib/muse/auth";
import { readMuseTraining } from "@/lib/muse/read";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const days = clampDays(request.nextUrl.searchParams.get("days"), 30, 90);
  const hevyLimit = clampDays(
    request.nextUrl.searchParams.get("hevy_limit"),
    40,
    80,
  );
  return museJson(request, () => readMuseTraining(days, hevyLimit));
}
