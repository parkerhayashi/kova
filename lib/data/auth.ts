import { createServiceClient } from "@/lib/supabase/server";
import { decryptToken, encryptToken } from "@/lib/crypto";

/** Whether a TOTP secret is stored (MFA required at login). */
export async function isMfaEnabled(): Promise<boolean> {
  return (await getTotpSecret()) !== null;
}

/** Decrypted TOTP seed from user_settings, or null when MFA is off. */
export async function getTotpSecret(): Promise<string | null> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("totp_secret")
    .limit(1)
    .maybeSingle();

  if (!data?.totp_secret) return null;
  const plain = decryptToken(data.totp_secret);
  return plain || null;
}

/** Persist an encrypted TOTP secret on the single user_settings row. */
export async function saveTotpSecret(plainSecret: string): Promise<void> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  const payload = { totp_secret: encryptToken(plainSecret) };

  if (data?.id) {
    await db.from("user_settings").update(payload).eq("id", data.id);
  } else {
    await db.from("user_settings").insert(payload);
  }
}

/** Remove MFA — login reverts to password-only. */
export async function clearTotpSecret(): Promise<void> {
  const db = createServiceClient();
  const { data } = await db
    .from("user_settings")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (data?.id) {
    await db.from("user_settings").update({ totp_secret: null }).eq("id", data.id);
  }
}
