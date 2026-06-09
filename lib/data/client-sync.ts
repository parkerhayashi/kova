import { createServiceClient } from "@/lib/supabase/server";
import type { ClientSyncPayload } from "@/types";

const EMPTY: ClientSyncPayload = {};

function normalizePayload(raw: unknown): ClientSyncPayload {
  if (!raw || typeof raw !== "object") return EMPTY;
  const o = raw as Record<string, unknown>;
  const out: ClientSyncPayload = {};
  for (const ns of ["goals", "coach", "finances"] as const) {
    const v = o[ns];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[ns] = v as Record<string, unknown>;
    }
  }
  return out;
}

/** Load synced client snapshots from user_settings. */
export async function getClientSync(): Promise<ClientSyncPayload> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("client_sync")
    .limit(1)
    .maybeSingle();

  return normalizePayload(data?.client_sync);
}

/** Replace one or more namespaces in client_sync (full namespace replace). */
export async function saveClientSync(partial: ClientSyncPayload): Promise<void> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("id, client_sync")
    .limit(1)
    .maybeSingle();

  const current = normalizePayload(data?.client_sync);
  const merged: ClientSyncPayload = { ...current };

  for (const ns of ["goals", "coach", "finances"] as const) {
    if (partial[ns] !== undefined) merged[ns] = partial[ns];
  }

  const payload = { client_sync: merged };

  if (data?.id) {
    await db.from("user_settings").update(payload).eq("id", data.id);
  } else {
    await db.from("user_settings").insert(payload);
  }
}
