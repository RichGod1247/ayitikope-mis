// scripts/debug-login.ts
import { PrismaClient } from "@prisma/client";
import { verify as argon2Verify } from "@node-rs/argon2";

const prisma = new PrismaClient();

async function main() {
  const email = String(process.env.TEST_EMAIL || "").trim().toLowerCase();
  const password = String(process.env.TEST_PASSWORD || "");

  if (!email) {
    console.log("Missing TEST_EMAIL env var.");
    process.exit(1);
  }
  if (!password) {
    console.log("Missing TEST_PASSWORD env var.");
    process.exit(1);
  }

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      lockedUntil: true,
      failedLoginCount: true,
      twoFactorEnabled: true,
      lastActiveTenantId: true,
    },
  });

  console.log("USER:", user);

  if (!user?.passwordHash) {
    console.log("NO passwordHash -> login will always fail.");
    return;
  }

  // ✅ Verify using argon2 directly (independent of your src/lib/password.ts)
  const okArgon2 = await argon2Verify(user.passwordHash, password);
  console.log("argon2Verify(hash, password) =", okArgon2);

  const memberships = await prisma.membership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: {
      tenantId: true,
      staffId: true,
      staffIdNorm: true,
      role: { select: { name: true } },
    },
  });

  console.log("ACTIVE MEMBERSHIPS:", memberships);
}

main()
  .catch((e) => {
    console.error("DEBUG SCRIPT ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
