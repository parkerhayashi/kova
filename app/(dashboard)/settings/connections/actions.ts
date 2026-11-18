"use server";

import { revalidatePath } from "next/cache";
import { clearOuraTokens } from "@/lib/data/oura";

/** Revoke Kova's Oura tokens. Synced Oura history stays in the database. */
export async function disconnectOuraAction(): Promise<void> {
  await clearOuraTokens();
  revalidatePath("/settings/connections");
}
