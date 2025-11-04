/* prisma/seed.cjs */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  // 1) Permissions
  const perms = [
    "view:announcement",
    "create:announcement",
    "edit:announcement",
    "delete:announcement",
    "manage:fees",
    "view:students",
    "edit:students",
    "view:teachers",
    "edit:teachers",
  ];
  for (const name of perms) {
    await prisma.permission.upsert({
      where: { name },
      create: { name },
      update: {},
    });
  }

  // 2) Tenants
  const t1 = await prisma.tenant.upsert({
    where: { slug: "ayitikope-basic" },
    create: { slug: "ayitikope-basic", name: "Ayitikope M/A Basic School" },
    update: {},
  });

  const t2 = await prisma.tenant.upsert({
    where: { slug: "sogakope-basic" },
    create: { slug: "sogakope-basic", name: "Sogakope M/A Basic School" },
    update: {},
  });

  // 3) Roles (tenant-scoped ADMIN for both tenants)
  const adminT1 = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: t1.id, name: "ADMIN" } },
    create: { tenantId: t1.id, name: "ADMIN", description: "Tenant administrator" },
    update: {},
  });

  const adminT2 = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: t2.id, name: "ADMIN" } },
    create: { tenantId: t2.id, name: "ADMIN", description: "Tenant administrator" },
    update: {},
  });

  // (Optional) attach some permissions to ADMIN roles
  const allPerms = await prisma.permission.findMany();
  for (const p of allPerms) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminT1.id, permissionId: p.id } },
      create: { roleId: adminT1.id, permissionId: p.id },
      update: {},
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminT2.id, permissionId: p.id } },
      create: { roleId: adminT2.id, permissionId: p.id },
      update: {},
    });
  }

  // 4) Admin user
  const email = "headteacher@ayitikope.school";
  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);
  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Head Teacher",
      passwordHash,
    },
    update: {},
  });

  // 5) Ensure memberships in BOTH tenants
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: t1.id } },
    create: {
      userId: user.id,
      tenantId: t1.id,
      roleId: adminT1.id,
      status: "ACTIVE",
    },
    update: { roleId: adminT1.id, status: "ACTIVE" },
  });

  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: t2.id } },
    create: {
      userId: user.id,
      tenantId: t2.id,
      roleId: adminT2.id,
      status: "ACTIVE",
    },
    update: { roleId: adminT2.id, status: "ACTIVE" },
  });

  console.log("Seed complete. Admin:", email, "Password: ChangeMe123!");
  console.log("Tenants:", [t1.slug, t2.slug]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
