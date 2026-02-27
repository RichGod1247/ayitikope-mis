// scripts/bootstrapSuperadmin.js
/* eslint-disable no-console */
const path = require("path");

// Load env from common places (works on your setup)
try {
  require("dotenv").config({ path: path.resolve(process.cwd(), ".env.local") });
} catch {}
try {
  require("dotenv").config({ path: path.resolve(process.cwd(), "prisma", ".env") });
} catch {}
try {
  require("dotenv").config();
} catch {}

const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient({ log: ["error", "warn"] });

async function main() {
  const email = (process.env.SUPERADMIN_EMAIL || "superadmin@edulifeos.com").toLowerCase().trim();
  const password = process.env.SUPERADMIN_PASSWORD || "ChangeMeNow123!";

  // Attach SUPERADMIN to a real tenant (simplest for your current auth/tenant-scoped roles)
  const envTenantId = (process.env.SUPERADMIN_TENANT_ID || "").trim();

  const tenant =
    (envTenantId
      ? await prisma.tenant.findUnique({ where: { id: envTenantId }, select: { id: true, name: true } })
      : await prisma.tenant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, name: true } }));

  if (!tenant) throw new Error("No tenant found. Create at least one tenant first.");

  // Ensure SUPERADMIN role exists in that tenant
  const role = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "SUPERADMIN" } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "SUPERADMIN",
      description: "Platform super admin",
    },
    select: { id: true, name: true },
  });

  const passwordHash = await bcrypt.hash(password, 10);

  // Create or update user
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      name: "EduLife OS Superadmin",
      timezone: "Africa/Accra",
      locale: "en",
      smsOptIn: true,
    },
    create: {
      email,
      passwordHash,
      name: "EduLife OS Superadmin",
      timezone: "Africa/Accra",
      locale: "en",
      smsOptIn: true,
    },
    select: { id: true, email: true },
  });

  // Ensure membership exists and is ACTIVE
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    update: { roleId: role.id, status: "ACTIVE" },
    create: { userId: user.id, tenantId: tenant.id, roleId: role.id, status: "ACTIVE" },
  });

  // Make tenant the active one (so your session picks it up)
  await prisma.user.update({
    where: { id: user.id },
    data: { lastActiveTenantId: tenant.id },
  });

  console.log("\n✅ SUPERADMIN READY");
  console.log("Tenant:", tenant.name, tenant.id);
  console.log("Email :", email);
  console.log("Pass  :", password);
  console.log("Now sign in, then open: /admin/super\n");
}

main()
  .catch((e) => {
    console.error("BOOTSTRAP FAILED:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });