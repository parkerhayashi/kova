import { NextResponse, type NextRequest } from "next/server";
import { linkPlaidItem } from "@/lib/data/finance";
import { isPlaidConfigured } from "@/lib/plaid";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** Exchange a Link public_token and run the first sync. */
export async function POST(request: NextRequest) {
  if (!isPlaidConfigured()) {
    return NextResponse.json({ error: "Plaid is not configured." }, { status: 503 });
  }

  let body: { public_token?: string; institution_name?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const public_token = body.public_token;
  if (!public_token || typeof public_token !== "string") {
    return NextResponse.json({ error: "public_token is required." }, { status: 400 });
  }

  try {
    const result = await linkPlaidItem(public_token, body.institution_name);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
