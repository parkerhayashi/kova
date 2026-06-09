import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { hasValidSession } from "@/lib/auth";
import { generateTotpSecret, getTotpUri } from "@/lib/totp";

export const dynamic = "force-dynamic";

/** Start MFA enrollment — returns QR + secret for the authenticator app. */
export async function POST() {
  if (!(await hasValidSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const secret = generateTotpSecret();
  const uri = getTotpUri(secret);
  const qrDataUrl = await QRCode.toDataURL(uri, {
    margin: 1,
    width: 220,
    color: { dark: "#ffffff", light: "#161616" },
  });

  return NextResponse.json({ secret, uri, qrDataUrl });
}
