import { type NextRequest } from "next/server";
import { clampDays, museJson } from "@/lib/muse/auth";
import { readMuseLife } from "@/lib/muse/read";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const days = clampDays(request.nextUrl.searchParams.get("days"), 30, 90);
  return museJson(request, () => readMuseLife(days));
}
