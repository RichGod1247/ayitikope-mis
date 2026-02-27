// src/lib/password.ts
import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import bcrypt from "bcryptjs";

const ARGON2_OPTS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function isArgonHash(h: string) {
  return h.startsWith("$argon2");
}

function isBcryptHash(h: string) {
  return h.startsWith("$2a$") || h.startsWith("$2b$") || h.startsWith("$2y$");
}

export async function hashPassword(password: string) {
  const pw = cleanStr(password);
  if (!pw) throw new Error("PASSWORD_REQUIRED");
  return argon2Hash(pw, ARGON2_OPTS);
}

/**
 * Backward-compatible verify:
 * - Argon2 for new accounts
 * - Bcrypt for legacy accounts
 */
export async function verifyPassword(password: string, storedHash: string) {
  const pw = cleanStr(password);
  const h = cleanStr(storedHash);
  if (!pw || !h) return false;

  if (isArgonHash(h)) {
    try {
      return await argon2Verify(h, pw); // ✅ (hash, password)
    } catch {
      return false;
    }
  }

  if (isBcryptHash(h)) {
    try {
      return await bcrypt.compare(pw, h);
    } catch {
      return false;
    }
  }

  return false;
}
