import { type NextRequest } from "next/server";
import { clampDays, museJson } from "@/lib/muse/auth";
import { readMuseNutrition } from "@/lib/muse/read";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const days = clampDays(request.nextUrl.searchParams.get("days"), 14, 90);
  const date = request.nextUrl.searchParams.get("date") ?? undefined;
  return museJson(request, () => readMuseNutrition(days, date));
}
