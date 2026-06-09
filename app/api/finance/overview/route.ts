import { NextResponse } from "next/server";
import { getFinanceOverview } from "@/lib/data/finance";
import { isPlaidConfigured } from "@/lib/plaid";

export const dynamic = "force-dynamic";

/** Linked accounts, monthly cashflow summary, recent transactions. */
export async function GET() {
  try {
    const overview = await getFinanceOverview();
    return NextResponse.json({
      ...overview,
      plaid_configured: isPlaidConfigured(),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
