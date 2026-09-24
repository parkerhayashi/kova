import { type NextRequest } from "next/server";
import { clampDays, museJson } from "@/lib/muse/auth";
import { readMuseBody } from "@/lib/muse/read";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const days = clampDays(request.nextUrl.searchParams.get("days"), 90, 180);
  return museJson(request, () => readMuseBody(days));
}
