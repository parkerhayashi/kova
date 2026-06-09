import { Secret, TOTP } from "otpauth";

const ISSUER = "Kova";
const LABEL = "Kova";

/** Generate a new base32 TOTP secret (20 bytes). */
export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

/** Build an otpauth:// URI for authenticator app QR scanning. */
export function getTotpUri(secretBase32: string): string {
  return new TOTP({
    issuer: ISSUER,
    label: LABEL,
    secret: Secret.fromBase32(secretBase32),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  }).toString();
}

/**
 * Verify a 6-digit TOTP code. Allows ±1 step (30s) for clock skew.
 * Returns false for malformed input without throwing.
 */
export function verifyTotpCode(
  secretBase32: string,
  code: string | undefined | null,
): boolean {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  try {
    const totp = new TOTP({
      issuer: ISSUER,
      label: LABEL,
      secret: Secret.fromBase32(secretBase32),
      algorithm: "SHA1",
      digits: 6,
      period: 30,
    });
    return totp.validate({ token: code, window: 1 }) !== null;
  } catch {
    return false;
  }
}
