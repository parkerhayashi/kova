import { NextResponse, type NextRequest } from "next/server";
import { isMuseAuthorized, museUnauthorized } from "@/lib/muse/auth";
import { getInsights } from "@/lib/data/insights";
import { normalizeIsoDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Weekly report (`?week=YYYY-MM-DD`, default this week, plus last week) and nutrition ↔ performance insights. */
export async function GET(request: NextRequest) {
  if (!isMuseAuthorized(request)) return museUnauthorized();
  const week = normalizeIsoDate(request.nextUrl.searchParams.get("week") ?? "") ?? undefined;
  const data = await getInsights(week);
  return NextResponse.json({
    today: data.today,
    report: data.report,
    previous_week: data.previous,
    // Scatter points stay in the app; Muse gets the finding and the numbers behind it.
    insights: data.insights.map(({ points, ...i }) => ({ ...i, pairs: points?.length ?? 0 })),
  });
}
