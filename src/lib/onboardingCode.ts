// src/lib/onboardingCode.ts
import { hash, verify } from "@node-rs/argon2";
import { prisma } from "@/lib/prisma";

const DEFAULT_TTL_MINUTES = 15;

// Generates codes like EDU-ABCDE-FGHIJ (easy to read, hard to guess)
export function generateOnboardingCode(prefix = "EDU") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1
  const chunk = (n: number) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join("");
  return `${prefix}-${chunk(5)}-${chunk(5)}`;
}

export async function hashOnboardingCode(code: string) {
  // Argon2id with reasonable params for “human-entered secrets”
  return hash(code, {
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

// ✅ Verifies the plaintext code against the ACTIVE record for that tenant.
// TTL logic:
// - If expiresAt exists in DB, we use it.
// - Else, we fall back to rotatedAt + 15min.
export async function verifyOnboardingCode(tenantId: string, plaintextCode: string) {
  const code = String(plaintextCode ?? "").trim();
  if (!tenantId || !code) return false;

  // Grab latest active code for this tenant
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

  // If expiresAt exists, prefer it
  const expiresAt = (rec as any).expiresAt as Date | undefined;
  if (expiresAt instanceof Date) {
    if (expiresAt.getTime() <= now) return false;
  } else {
    // fallback: rotatedAt + TTL
    const rotatedAt = rec.rotatedAt?.getTime?.() ?? 0;
    if (!rotatedAt) return false;
    const ttlMs = DEFAULT_TTL_MINUTES * 60 * 1000;
    if (rotatedAt + ttlMs <= now) return false;
  }

  // Verify hash
  return verify(rec.codeHash, code);
}
