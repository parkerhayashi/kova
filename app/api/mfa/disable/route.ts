import { NextResponse, type NextRequest } from "next/server";
import { hasValidSession, verifyPassword } from "@/lib/auth";
import { clearTotpSecret, getTotpSecret } from "@/lib/data/auth";
import { verifyTotpCode } from "@/lib/totp";

export const dynamic = "force-dynamic";

/** Disable MFA after re-verifying password and a current TOTP code. */
export async function POST(request: NextRequest) {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const password = typeof body?.password === "string" ? body.password : "";
  const code = typeof body?.code === "string" ? body.code : "";

  if (!verifyPassword(password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 400 });
  }

  const secret = await getTotpSecret();
  if (!secret || !verifyTotpCode(secret, code)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }

  await clearTotpSecret();
  return NextResponse.json({ ok: true });
}
