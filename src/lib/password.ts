import { hash, verify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";

const ARGON2_OPTS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

function isArgonHash(h: string) {
  return h.startsWith("$argon2");
}
function isBcryptHash(h: string) {
  return h.startsWith("$2a$") || h.startsWith("$2b$") || h.startsWith("$2y$");
}

export async function hashPassword(password: string) {
  return hash(password, ARGON2_OPTS);
}

/**
 * Backward-compatible verify:
 * - Argon2 for new accounts
 * - Bcrypt for legacy accounts
 */
export async function verifyPassword(password: string, storedHash: string) {
  if (!storedHash) return false;

  if (isArgonHash(storedHash)) {
    return verify(storedHash, password);
  }

  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(password, storedHash);
  }

  // Unknown format
  return false;
}
