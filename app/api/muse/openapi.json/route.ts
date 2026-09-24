import { NextResponse } from "next/server";
import { museOpenApi } from "@/lib/muse/openapi";

export const dynamic = "force-dynamic";

/** Public spec — no token. Data routes still require MUSE_API_TOKEN. */
export async function GET() {
  return NextResponse.json(museOpenApi(), {
    headers: { "Cache-Control": "no-store" },
  });
}
