import { NextResponse, type NextRequest } from "next/server";
import { disconnectPlaidItem } from "@/lib/data/finance";

export const dynamic = "force-dynamic";

/** Disconnect a linked institution (Plaid item/remove + local delete). */
export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id query param required." }, { status: 400 });
  }

  try {
    await disconnectPlaidItem(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
