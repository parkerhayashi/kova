/**
 * Symmetric encryption for integration tokens at rest (blueprint §6 — the
 * *_token columns in user_settings are marked encrypted).
 *
 * AES-256-GCM with a key derived from TOKEN_ENCRYPTION_KEY. Server-side only —
 * never import from a client component. Stored format is a single string:
 *   v1.<ivB64>.<authTagB64>.<cipherB64>
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const PREFIX = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = process.env.TOKEN_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set — required to encrypt integration tokens.",
    );
  }
  // Deterministic 32-byte key from the secret; static salt is fine for a
  // single-user app where the secret itself is the protected value.
  cachedKey = scryptSync(secret, "kova-token-encryption", 32);
  return cachedKey;
}

/** Encrypt a plaintext token. Returns the versioned, self-describing string. */
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(".");
}

/**
 * Decrypt a token produced by {@link encryptToken}. Values that aren't in the
 * versioned format are returned unchanged so plaintext rows (or a key that was
 * added after the fact) degrade gracefully instead of throwing.
 */
export function decryptToken(value: string): string {
  if (!value.startsWith(`${PREFIX}.`)) return value;
  const [, ivB64, tagB64, dataB64] = value.split(".");
  if (!ivB64 || !tagB64 || !dataB64) return value;

  const decipher = createDecipheriv(
    ALGO,
    getKey(),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
