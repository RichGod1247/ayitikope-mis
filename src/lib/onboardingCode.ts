// src/lib/onboardingCode.ts
import crypto from "crypto";
import { prisma } from "@/lib/prisma";

// Optional: if you ever store argon2 hashes in the future, this supports it too.
// If @node-rs/argon2 isn't installed, remove these two lines and the argon2 block below.
import { verify as argon2Verify } from "@node-rs/argon2";

const DEFAULT_TTL_MINUTES = 15;

function sha256Hex(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// Generates codes like TCH-ABCDE-FGHIJ (easy to read, hard to guess)
export function generateOnboardingCode(prefix = "TCH") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1
  const chunk = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `${prefix}-${chunk(5)}-${chunk(5)}`;
}

// Hashing scheme currently used by your enroll code:
// digest = sha256(`${code}.${salt}`), stored as `${digest}:${salt}`
export async function hashOnboardingCode(code: string) {
  const c = String(code ?? "").trim();
  if (!c) throw new Error("EMPTY_CODE");

  const salt = crypto.randomBytes(5).toString("hex").toUpperCase(); // short salt
  const digest = sha256Hex(`${c}.${salt}`);
  return `${digest}:${salt}`;
}

// ✅ Verifies the plaintext code against the ACTIVE record for that tenant.
// Supports BOTH formats:
// - sha256:salt (your current DB)
// - argon2 hash (future-proof)
// TTL logic:
// - If expiresAt exists in DB, we use it.
// - Else, we fall back to rotatedAt + 15min.
export async function verifyOnboardingCode(tenantId: string, plaintextCode: string) {
  const code = String(plaintextCode ?? "").trim();
  if (!tenantId || !code) return false;

  const rec = await prisma.tenantOnboardingCode.findFirst({
    where: { tenantId, active: true },
    orderBy: { rotatedAt: "desc" },
    select: {
      id: true,
      codeHash: true,
      rotatedAt: true,
      expiresAt: true,
    },
  });

  if (!rec?.codeHash) return false;

  // TTL check
  const now = Date.now();
  const expiresAt = rec.expiresAt as Date | null;

  if (expiresAt instanceof Date) {
    if (expiresAt.getTime() <= now) return false;
  } else {
    const rotatedAt = rec.rotatedAt?.getTime?.() ?? 0;
    if (!rotatedAt) return false;
    const ttlMs = DEFAULT_TTL_MINUTES * 60 * 1000;
    if (rotatedAt + ttlMs <= now) return false;
  }

  const hashStr = String(rec.codeHash);

  // Format 1: sha256:salt (your current DB)
  if (hashStr.includes(":") && !hashStr.startsWith("$argon2")) {
    const [digest, salt] = hashStr.split(":");
    if (!digest || !salt) return false;
    const check = sha256Hex(`${code}.${salt}`);
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(check));
  }

  // Format 2: argon2 (future)
  if (hashStr.startsWith("$argon2")) {
    try {
      return await argon2Verify(hashStr, code);
    } catch {
      return false;
    }
  }

  return false;
}
