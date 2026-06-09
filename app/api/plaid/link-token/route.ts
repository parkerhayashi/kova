import { NextResponse } from "next/server";
import { createLinkToken, isPlaidConfigured } from "@/lib/plaid";

export const dynamic = "force-dynamic";

/** Mint a Plaid Link token for the connect modal. */
export async function POST() {
  if (!isPlaidConfigured()) {
    return NextResponse.json(
      { error: "Plaid is not configured (PLAID_CLIENT_ID / PLAID_SECRET)." },
      { status: 503 },
    );
  }
  try {
    const { link_token } = await createLinkToken();
    return NextResponse.json({ link_token });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
