import { type NextRequest } from "next/server";
import { museJson } from "@/lib/muse/auth";
import { readMuseTrends } from "@/lib/muse/read";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get("range") ?? undefined;
  return museJson(request, () => readMuseTrends(range));
}
