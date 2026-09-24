import { NextResponse, type NextRequest } from "next/server";
import { museConnectorDocs } from "@/lib/muse/openapi";

export const dynamic = "force-dynamic";

/** Public setup brief Muse can fetch before the token is stored. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  return new NextResponse(museConnectorDocs(origin), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
