// prisma/seed/ensure-tenant-roles.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ["error", "warn"] });

const NEEDED_ROLES = [
  { name: "TEACHER", description: "Teacher" },
  { name: "SCHOOL_ADMIN", description: "School Administrator" },
  { name: "HEADTEACHER", description: "Headteacher/Headmaster" },
] as const;

type NeededRole = (typeof NEEDED_ROLES)[number];

function cleanKey(v: unknown) {
  return String(v ?? "").trim();
}

async function resolveTenant(tenantKey: string) {
  const key = cleanKey(tenantKey);
  if (!key) return null;

  return prisma.tenant.findFirst({
    where: {
      OR: [
        { id: key },
        { schoolCode: { equals: key, mode: "insensitive" } },
        { slug: { equals: key, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, schoolCode: true, slug: true },
  });
}

async function resolveTenantFromArgs(): Promise<{ id: string; name: string; schoolCode: string; slug: string } | null> {
  const arg = cleanKey(process.argv[2]);

  if (arg) return resolveTenant(arg);

  // No arg provided:
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed roles in production without an explicit tenant key.\n" +
        "Usage: npx ts-node prisma/seed/ensure-tenant-roles.ts <tenantId|schoolCode|slug>"
    );
  }

  // Dev convenience: if exactly ONE tenant exists, use it.
  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, schoolCode: true, slug: true },
    orderBy: { createdAt: "asc" },
    take: 10,
  });

  if (tenants.length === 1) return tenants[0];

  const list = tenants
    .map((t) => `- ${t.name} | schoolCode=${t.schoolCode} | slug=${t.slug} | id=${t.id}`)
    .join("\n");

  throw new Error(
    "No tenant key provided, and multiple tenants exist.\n" +
      "Pass one of: tenantId | schoolCode | slug\n\n" +
      "Found (first 10):\n" +
      (list || "- (none)")
  );
}

async function upsertRole(tenantId: string, role: NeededRole) {
  // Prisma generates a compound unique input for @@unique([tenantId, name])
  // Its name is usually tenantId_name
  return prisma.role.upsert({
    where: { tenantId_name: { tenantId, name: role.name } },
    update: { description: role.description },
    create: { tenantId, name: role.name, description: role.description },
    select: { id: true, name: true },
  });
}

async function main() {
  const tenant = await resolveTenantFromArgs();
  if (!tenant) throw new Error("Tenant not found.");

  console.log(`\n🏫 Seeding roles for: ${tenant.name} (${tenant.schoolCode}) slug=${tenant.slug}\n`);

  for (const role of NEEDED_ROLES) {
    const r = await upsertRole(tenant.id, role);
    console.log(`✅ Ensured role: ${r.name}`);
  }

  console.log("\n🎉 Role seeding complete.\n");
}

main()
  .catch((e) => {
    console.error("❌ Role seed failed:", e?.message ?? e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
