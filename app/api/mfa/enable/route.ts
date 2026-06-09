import { NextResponse, type NextRequest } from "next/server";
import { hasValidSession } from "@/lib/auth";
import { saveTotpSecret } from "@/lib/data/auth";
import { verifyTotpCode } from "@/lib/totp";

export const dynamic = "force-dynamic";

/** Confirm enrollment by verifying a code against the pending secret. */
export async function POST(request: NextRequest) {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const secret = typeof body?.secret === "string" ? body.secret : "";
  const code = typeof body?.code === "string" ? body.code : "";

  if (!secret || !verifyTotpCode(secret, code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  await saveTotpSecret(secret);
  return NextResponse.json({ ok: true });
}
