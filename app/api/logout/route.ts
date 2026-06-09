import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const res = NextResponse.redirect(new URL("/login", request.url), {
    status: 303,
  });
  clearSessionCookie(res, request);
  return res;
}
