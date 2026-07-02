import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Field-level encryption seam for sensitive free-text (e.g. health-reading notes).
 *
 * Modes (ENCRYPTION_MODE):
 *   "off"  (wellness)  -> stored as plaintext; rely on DB at-rest encryption.
 *   "on"   (clinical)  -> AES-256-GCM encrypt-at-write.
 *
 * Decryption auto-detects the "enc:v1:" prefix, so flipping the mode on/off never
 * requires a migration or a rewrite — old rows keep decrypting either way.
 */

const PREFIX = "enc:v1:";
const mode = () => process.env.ENCRYPTION_MODE ?? "off";

function key(): Buffer {
  const source = process.env.ENCRYPTION_KEY || "convene-dev-insecure-key";
  return scryptSync(source, "convene-field-salt", 32);
}

export function encryptField(plaintext: string | null | undefined): string | null {
  if (plaintext == null) return null;
  if (mode() !== "on") return plaintext; // wellness mode: no-op
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptField(value: string | null | undefined): string | null {
  if (value == null) return null;
  if (!value.startsWith(PREFIX)) return value; // was stored as plaintext
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export const encryptionMode = mode;
