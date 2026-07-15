import { NextResponse, type NextRequest } from "next/server";
import { getClientSync, saveClientSync } from "@/lib/data/client-sync";
import type { ClientSyncPayload } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const sync = await getClientSync();
  return NextResponse.json({ sync });
}

export async function PUT(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as ClientSyncPayload | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const partial: ClientSyncPayload = {};
  for (const ns of ["coach", "finances"] as const) {
    const v = body[ns];
    if (v !== undefined) {
      if (typeof v !== "object" || v === null || Array.isArray(v)) {
        return NextResponse.json({ error: `Invalid ${ns}` }, { status: 400 });
      }
      partial[ns] = v as Record<string, unknown>;
    }
  }

  if (Object.keys(partial).length === 0) {
    return NextResponse.json({ error: "No namespaces provided" }, { status: 400 });
  }

  await saveClientSync(partial);
  return NextResponse.json({ ok: true });
}
