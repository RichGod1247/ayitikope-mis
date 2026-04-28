// prisma/seed.ts
// Creates the Ayitikope pilot school tenant + headteacher account + GES zone hierarchy.
// Run with: SEED=1 npx ts-node --project tsconfig.seed.json prisma/seed.ts

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient, TenantStatus } from "@prisma/client";
import { hash as argon2Hash } from "@node-rs/argon2";

for (const p of [".env.local", ".env", "prisma/.env"]) {
  const fp = path.resolve(process.cwd(), p);
  if (fs.existsSync(fp)) { dotenv.config({ path: fp }); break; }
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(raw);
}

function guard() {
  if (!envBool("SEED", false)) {
    console.log("ℹ️  Seed skipped. Set SEED=1 to run.");
    process.exit(0);
  }
  const nodeEnv = (process.env.NODE_ENV ?? "development").toLowerCase();
  if (nodeEnv === "production" && !envBool("ALLOW_PROD_SEED", false)) {
    console.error("❌ Refusing to seed in production. Set ALLOW_PROD_SEED=1 if intentional.");
    process.exit(1);
  }
}

const prisma = new PrismaClient({ log: ["warn", "error"] });
const ARGON2_OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

async function main() {
  guard();

  console.log("🌱 Seeding Ayitikope pilot school + Ghana GES zone hierarchy…");

  // ─── 1. Ayitikope Tenant ───────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "ayitikope-ma-basic" },
    create: {
      name: "Ayitikope M/A Basic School",
      slug: "ayitikope-ma-basic",
      schoolCode: "SCH-AYI-001",
      status: TenantStatus.ACTIVE,
      region: "Volta Region",
      district: "Akatsi South District",
      circuit: "Akatsi South Circuit 1",
      timezone: "Africa/Accra",
      locale: "en",
    },
    update: {
      status: TenantStatus.ACTIVE,
      district: "Akatsi South District",
      circuit: "Akatsi South Circuit 1",
      region: "Volta Region",
    },
  });
  console.log(`✅ Tenant: ${tenant.name} (${tenant.id})`);

  // ─── 2. TenantSettings ────────────────────────────────────────────────────
  await prisma.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      currentTerm: "1st Term",
      currentAcademicYear: "2025/2026",
      term1Start: new Date("2026-01-12"),
      term1End: new Date("2026-04-11"),
      term2Start: new Date("2026-05-04"),
      term2End: new Date("2026-08-01"),
      term3Start: new Date("2026-09-07"),
      term3End: new Date("2026-12-12"),
      attendanceStartTime: "07:30",
      attendanceEndTime: "15:30",
      lateCutoffMinutes: 20,
      feverThreshold: 37.5,
    },
    update: {},
  });
  console.log("✅ TenantSettings");

  // ─── 3. School roles ──────────────────────────────────────────────────────
  const headteacherRole = await prisma.role.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: "HEADTEACHER" } },
    create: { tenantId: tenant.id, name: "HEADTEACHER", description: "School headteacher" },
    update: {},
  });
  for (const roleName of ["CLASS_TEACHER", "SUBJECT_TEACHER", "SCHOOL_ADMIN"]) {
    await prisma.role.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: roleName } },
      create: { tenantId: tenant.id, name: roleName },
      update: {},
    });
  }
  console.log("✅ School roles");

  // ─── 4. Headteacher user + membership ────────────────────────────────────
  const htPasswordHash = await argon2Hash("HeadTeach#2026", ARGON2_OPTS);
  const htUser = await prisma.user.upsert({
    where: { email: "headteacher@ayitikope.school" },
    create: {
      email: "headteacher@ayitikope.school",
      passwordHash: htPasswordHash,
      name: "Head Teacher",
      firstName: "Head",
      lastName: "Teacher",
      timezone: "Africa/Accra",
      locale: "en",
      lastActiveTenantId: tenant.id,
    },
    update: { passwordHash: htPasswordHash, lastActiveTenantId: tenant.id },
  });
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: htUser.id, tenantId: tenant.id } },
    create: {
      userId: htUser.id,
      tenantId: tenant.id,
      roleId: headteacherRole.id,
      status: "ACTIVE",
      staffId: "HT-001",
      staffIdNorm: "HT001",
    },
    update: { roleId: headteacherRole.id, status: "ACTIVE" },
  });
  console.log(`✅ Headteacher: ${htUser.email}`);

  // ─── 5. Permissions ──────────────────────────────────────────────────────
  const perms = [
    "view:announcement", "create:announcement", "edit:announcement", "delete:announcement",
    "manage:fees", "view:students", "edit:students", "view:teachers", "edit:teachers",
    "CONSENT_VIEW", "CONSENT_EDIT", "CONSENT_EXPORT",
  ];
  for (const name of perms) {
    await prisma.permission.upsert({ where: { name }, create: { name }, update: {} });
  }
  console.log("✅ Permissions");

  // ─── 6. Ghana GES Zone Type Hierarchy ────────────────────────────────────
  const zoneTypes = [
    { countryCode: "GH", level: 1, name: "Circuit" },
    { countryCode: "GH", level: 2, name: "District" },
    { countryCode: "GH", level: 3, name: "Region" },
    { countryCode: "GH", level: 4, name: "National" },
  ];

  const zoneTypeMap: Record<number, string> = {};
  for (const zt of zoneTypes) {
    const rec = await prisma.adminZoneType.upsert({
      where: { countryCode_level: { countryCode: zt.countryCode, level: zt.level } },
      create: zt,
      update: { name: zt.name },
    });
    zoneTypeMap[zt.level] = rec.id;
  }
  console.log("✅ AdminZoneType hierarchy (GH: Circuit/District/Region/National)");

  // ─── 7. Ghana Zones ──────────────────────────────────────────────────────
  // National
  const ghNational = await prisma.adminZone.upsert({
    where: { id: "zone-gh-national" },
    create: { id: "zone-gh-national", name: "Ghana", code: "GH", zoneTypeId: zoneTypeMap[4] },
    update: { name: "Ghana" },
  });

  // Volta Region
  const voltaRegion = await prisma.adminZone.upsert({
    where: { id: "zone-gh-volta-region" },
    create: {
      id: "zone-gh-volta-region",
      name: "Volta Region",
      code: "VR",
      zoneTypeId: zoneTypeMap[3],
      parentZoneId: ghNational.id,
    },
    update: { name: "Volta Region" },
  });

  // Akatsi South District
  const akatsiDistrict = await prisma.adminZone.upsert({
    where: { id: "zone-gh-akatsi-south-district" },
    create: {
      id: "zone-gh-akatsi-south-district",
      name: "Akatsi South District",
      code: "ASD",
      zoneTypeId: zoneTypeMap[2],
      parentZoneId: voltaRegion.id,
    },
    update: { name: "Akatsi South District" },
  });

  // Akatsi South Circuit 1
  const akatsiCircuit = await prisma.adminZone.upsert({
    where: { id: "zone-gh-akatsi-south-circuit-1" },
    create: {
      id: "zone-gh-akatsi-south-circuit-1",
      name: "Akatsi South Circuit 1",
      code: "ASC1",
      zoneTypeId: zoneTypeMap[1],
      parentZoneId: akatsiDistrict.id,
    },
    update: { name: "Akatsi South Circuit 1" },
  });

  console.log("✅ Ghana zones (National → Volta Region → Akatsi South District → Circuit 1)");

  // ─── 8. Link Ayitikope tenant to circuit zone ─────────────────────────────
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { zoneId: akatsiCircuit.id },
  });
  console.log(`✅ Tenant linked to zone: ${akatsiCircuit.name}`);

  // ─── 9. GES System Tenant (for GES officer memberships) ──────────────────
  const gesTenant = await prisma.tenant.upsert({
    where: { slug: "ges-system" },
    create: {
      name: "GES National System",
      slug: "ges-system",
      schoolCode: "SCH-GES-000",
      status: TenantStatus.ACTIVE,
      timezone: "Africa/Accra",
      locale: "en",
    },
    update: { status: TenantStatus.ACTIVE },
  });
  console.log(`✅ GES system tenant: ${gesTenant.id}`);

  // GES roles in the system tenant
  const gesRoleNames = ["SISO", "DISTRICT_DIRECTOR", "REGIONAL_DIRECTOR", "GES_HQ"];
  const gesRoles: Record<string, string> = {};
  for (const roleName of gesRoleNames) {
    const r = await prisma.role.upsert({
      where: { tenantId_name: { tenantId: gesTenant.id, name: roleName } },
      create: { tenantId: gesTenant.id, name: roleName, description: `GES role: ${roleName}` },
      update: {},
    });
    gesRoles[roleName] = r.id;
  }
  console.log("✅ GES roles: SISO, DISTRICT_DIRECTOR, REGIONAL_DIRECTOR, GES_HQ");

  // ─── 10. SISO test account ────────────────────────────────────────────────
  const sisoPasswordHash = await argon2Hash("SISO#2026", ARGON2_OPTS);
  const sisoUser = await prisma.user.upsert({
    where: { email: "siso@akatsi-circuit1.ges.gov.gh" },
    create: {
      email: "siso@akatsi-circuit1.ges.gov.gh",
      passwordHash: sisoPasswordHash,
      name: "SISO Akatsi South Circuit 1",
      firstName: "SISO",
      lastName: "Akatsi",
      timezone: "Africa/Accra",
      locale: "en",
      lastActiveTenantId: gesTenant.id,
    },
    update: { passwordHash: sisoPasswordHash, lastActiveTenantId: gesTenant.id },
  });
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: sisoUser.id, tenantId: gesTenant.id } },
    create: {
      userId: sisoUser.id,
      tenantId: gesTenant.id,
      roleId: gesRoles["SISO"],
      status: "ACTIVE",
    },
    update: { roleId: gesRoles["SISO"], status: "ACTIVE" },
  });
  await prisma.gesOfficer.upsert({
    where: { userId: sisoUser.id },
    create: {
      userId: sisoUser.id,
      zoneId: akatsiCircuit.id,
      title: "SISO",
      notifMuted: false,
    },
    update: { zoneId: akatsiCircuit.id, title: "SISO" },
  });
  console.log(`✅ SISO: ${sisoUser.email}`);

  // ─── 11. District Director test account ───────────────────────────────────
  const ddPasswordHash = await argon2Hash("Director#2026", ARGON2_OPTS);
  const ddUser = await prisma.user.upsert({
    where: { email: "director@akatsi-south.ges.gov.gh" },
    create: {
      email: "director@akatsi-south.ges.gov.gh",
      passwordHash: ddPasswordHash,
      name: "District Director Akatsi South",
      firstName: "Director",
      lastName: "Akatsi South",
      timezone: "Africa/Accra",
      locale: "en",
      lastActiveTenantId: gesTenant.id,
    },
    update: { passwordHash: ddPasswordHash, lastActiveTenantId: gesTenant.id },
  });
  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: ddUser.id, tenantId: gesTenant.id } },
    create: {
      userId: ddUser.id,
      tenantId: gesTenant.id,
      roleId: gesRoles["DISTRICT_DIRECTOR"],
      status: "ACTIVE",
    },
    update: { roleId: gesRoles["DISTRICT_DIRECTOR"], status: "ACTIVE" },
  });
  await prisma.gesOfficer.upsert({
    where: { userId: ddUser.id },
    create: {
      userId: ddUser.id,
      zoneId: akatsiDistrict.id,
      title: "District Director",
      notifMuted: false,
    },
    update: { zoneId: akatsiDistrict.id, title: "District Director" },
  });
  console.log(`✅ District Director: ${ddUser.email}`);

  console.log("\n🎉 Seed complete!");
  console.log(`   Ayitikope tenant  : ${tenant.id}`);
  console.log(`   GES system tenant : ${gesTenant.id}`);
  console.log(`   Headteacher       : headteacher@ayitikope.school / HeadTeach#2026`);
  console.log(`   SISO              : siso@akatsi-circuit1.ges.gov.gh / SISO#2026`);
  console.log(`   District Director : director@akatsi-south.ges.gov.gh / Director#2026`);
}

main()
  .catch((err) => { console.error("❌ Seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
