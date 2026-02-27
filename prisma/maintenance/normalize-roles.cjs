/* prisma/maintenance/normalize-roles.cjs */
"use strict";

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

for (const p of ["prisma/.env", ".env", ".env.local"]) {
  const fp = path.resolve(process.cwd(), p);
  if (fs.existsSync(fp)) dotenv.config({ path: fp });
}

const prisma = new PrismaClient({ log: ["warn", "error"] });

function cleanStr(v) {
  return String(v ?? "").trim();
}
function roleKey(name) {
  return cleanStr(name).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const CANON = [
  { name: "TEACHER", description: "Teacher" },
  { name: "SCHOOL_ADMIN", description: "School Administrator" },
  { name: "HEADTEACHER", description: "Headteacher/Headmaster" },
  { name: "ADMIN", description: "Legacy tenant admin (compat)" },
];

async function ensureCanonicalRoles(tenantId) {
  const map = new Map(); // roleKey -> role row
  for (const r of CANON) {
    const row = await prisma.role.upsert({
      where: { tenantId_name: { tenantId, name: r.name } },
      create: { tenantId, name: r.name, description: r.description },
      update: { description: r.description },
      select: { id: true, name: true },
    });
    map.set(roleKey(row.name), row);
  }
  return map;
}

async function main() {
  const tenantKey = cleanStr(process.env.TENANT_KEY); // optional
  const tenants = tenantKey
    ? await prisma.tenant.findMany({
        where: {
          OR: [
            { id: tenantKey },
            { slug: { equals: tenantKey, mode: "insensitive" } },
            { schoolCode: { equals: tenantKey, mode: "insensitive" } },
            { emisCode: { equals: tenantKey, mode: "insensitive" } },
          ],
        },
        select: { id: true, slug: true, name: true },
      })
    : await prisma.tenant.findMany({ select: { id: true, slug: true, name: true } });

  if (!tenants.length) throw new Error("No tenants found for normalization.");

  for (const t of tenants) {
    console.log(`\n🔧 Normalizing roles for: ${t.name} (${t.slug})`);
    const canonMap = await ensureCanonicalRoles(t.id);

    const roles = await prisma.role.findMany({
      where: { tenantId: t.id },
      select: { id: true, name: true, description: true, rolePerms: { select: { permissionId: true } } },
    });

    for (const r of roles) {
      const k = roleKey(r.name);
      const canonical = canonMap.get(k);

      // Only merge if it matches one of our canonical keys AND is not already that canonical role row
      if (!canonical) continue;
      if (canonical.id === r.id) continue;

      // 1) Transfer permissions
      for (const rp of r.rolePerms) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: canonical.id, permissionId: rp.permissionId } },
          create: { roleId: canonical.id, permissionId: rp.permissionId },
          update: {},
        });
      }

      // 2) Re-point memberships + invites
      await prisma.membership.updateMany({ where: { roleId: r.id }, data: { roleId: canonical.id } });
      await prisma.invite.updateMany({ where: { roleId: r.id }, data: { roleId: canonical.id } });

      // 3) Delete old role (rolePerms is cascade by Prisma? not guaranteed—delete explicitly)
      await prisma.rolePermission.deleteMany({ where: { roleId: r.id } });
      await prisma.role.delete({ where: { id: r.id } });

      console.log(`✅ Merged role "${r.name}" -> "${canonical.name}"`);
    }
  }

  console.log("\n✅ Role normalization done.");
}

main()
  .catch((e) => {
    console.error("❌ normalize-roles failed:", e?.message ?? e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
