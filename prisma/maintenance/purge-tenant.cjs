/* prisma/maintenance/purge-tenant.cjs */
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

async function resolveTenantByKey(key) {
  const k = cleanStr(key);
  if (!k) return null;

  return prisma.tenant.findFirst({
    where: {
      OR: [
        { id: k },
        { slug: { equals: k, mode: "insensitive" } },
        { schoolCode: { equals: k, mode: "insensitive" } },
        { emisCode: { equals: k, mode: "insensitive" } },
      ],
    },
    select: { id: true, slug: true, name: true, schoolCode: true },
  });
}

async function counts(tenantId) {
  const [
    memberships,
    teacherProfiles,
    invites,
    onboardingCodes,
    roles,
    rolePerms,
    students,
    classrooms,
    attendanceSessions,
    attendanceMarks,
    studentHealth,
    teacherHealth,
    lessonNotes,
    schemes,
    schemeItems,
    assessments,
    assessmentItems,
    feesInvoiceLegacy,
    feeStructures,
    feeInvoices,
    feePayments,
    announcements,
    auditLogs,
    smsAudit,
    smsLogs,
    tenantSettings,
    tenantCurriculumUnits,
  ] = await Promise.all([
    prisma.membership.count({ where: { tenantId } }),
    prisma.teacherProfile.count({ where: { tenantId } }),
    prisma.invite.count({ where: { tenantId } }),
    prisma.tenantOnboardingCode.count({ where: { tenantId } }),
    prisma.role.count({ where: { tenantId } }),
    prisma.rolePermission.count({ where: { role: { tenantId } } }),
    prisma.student.count({ where: { tenantId } }),
    prisma.classroom.count({ where: { tenantId } }),
    prisma.attendanceSession.count({ where: { tenantId } }),
    prisma.attendanceMark.count({ where: { session: { tenantId } } }),
    prisma.studentHealthDaily.count({ where: { tenantId } }),
    prisma.teacherHealthWeekly.count({ where: { tenantId } }),
    prisma.lessonNote.count({ where: { tenantId } }),
    prisma.schemeOfWork.count({ where: { tenantId } }),
    prisma.schemeOfWorkItem.count({ where: { scheme: { tenantId } } }),
    prisma.assessment.count({ where: { tenantId } }),
    prisma.assessmentItem.count({ where: { tenantId } }),
    prisma.feesInvoice.count({ where: { tenantId } }),
    prisma.feeStructure.count({ where: { tenantId } }),
    prisma.feeInvoice.count({ where: { tenantId } }),
    prisma.feePayment.count({ where: { tenantId } }),
    prisma.announcement.count({ where: { tenantId } }),
    prisma.auditLog.count({ where: { tenantId } }),
    prisma.sMSSendAudit.count({ where: { tenantId } }),
    prisma.smsLog.count({ where: { tenantId } }),
    prisma.tenantSettings.count({ where: { tenantId } }),
    prisma.curriculumUnit.count({ where: { tenantId } }),
  ]);

  return {
    memberships,
    teacherProfiles,
    invites,
    onboardingCodes,
    roles,
    rolePerms,
    students,
    classrooms,
    attendanceSessions,
    attendanceMarks,
    studentHealth,
    teacherHealth,
    lessonNotes,
    schemes,
    schemeItems,
    assessments,
    assessmentItems,
    feesInvoiceLegacy,
    feeStructures,
    feeInvoices,
    feePayments,
    announcements,
    auditLogs,
    smsAudit,
    smsLogs,
    tenantSettings,
    tenantCurriculumUnits,
  };
}

async function main() {
  const tenantKey = cleanStr(process.env.TENANT_KEY);
  if (!tenantKey) throw new Error("TENANT_KEY is required (id/slug/schoolCode).");

  const t = await resolveTenantByKey(tenantKey);
  if (!t) throw new Error(`Tenant not found for key: ${tenantKey}`);

  const dryRun = cleanStr(process.env.DRY_RUN || "true").toLowerCase() !== "false";
  const confirm = cleanStr(process.env.CONFIRM);

  const c = await counts(t.id);
  console.log("\n🎯 Target tenant:", t);
  console.log("📊 Tenant-scoped row counts:", c);

  if (dryRun) {
    console.log("\n🧪 DRY_RUN=true (default). No deletes performed.");
    console.log(`To actually delete, run:\nDRY_RUN=false CONFIRM=DELETE_${t.slug} TENANT_KEY=${t.slug} node prisma/maintenance/purge-tenant.cjs\n`);
    return;
  }

  if (confirm !== `DELETE_${t.slug}`) {
    throw new Error(`Refusing to delete. Set CONFIRM=DELETE_${t.slug}`);
  }

  console.log("\n🔥 Deleting tenant data...");

  // 0) Detach any tenant-linked curriculum units (prevents Restrict block)
  await prisma.curriculumUnit.updateMany({ where: { tenantId: t.id }, data: { tenantId: null } });

  // 1) Attendance
  await prisma.attendanceMark.deleteMany({ where: { session: { tenantId: t.id } } });
  await prisma.attendanceSession.deleteMany({ where: { tenantId: t.id } });

  // 2) Health
  await prisma.studentHealthDaily.deleteMany({ where: { tenantId: t.id } });
  await prisma.teacherHealthWeekly.deleteMany({ where: { tenantId: t.id } });

  // 3) SMS/Audit
  await prisma.sMSSendAudit.deleteMany({ where: { tenantId: t.id } });
  await prisma.smsLog.deleteMany({ where: { tenantId: t.id } });

  // 4) Fees
  await prisma.feePayment.deleteMany({ where: { tenantId: t.id } });
  await prisma.feeInvoice.deleteMany({ where: { tenantId: t.id } });
  await prisma.feeStructure.deleteMany({ where: { tenantId: t.id } });
  await prisma.feesInvoice.deleteMany({ where: { tenantId: t.id } });

  // 5) Assessments
  await prisma.assessment.deleteMany({ where: { tenantId: t.id } });
  await prisma.assessmentItem.deleteMany({ where: { tenantId: t.id } });

  // 6) Lesson notes + schemes
  await prisma.lessonNote.deleteMany({ where: { tenantId: t.id } });
  await prisma.schemeOfWork.deleteMany({ where: { tenantId: t.id } }); // cascades items

  // 7) Content + org
  await prisma.announcement.deleteMany({ where: { tenantId: t.id } });
  await prisma.auditLog.deleteMany({ where: { tenantId: t.id } });
  await prisma.invite.deleteMany({ where: { tenantId: t.id } });
  await prisma.tenantOnboardingCode.deleteMany({ where: { tenantId: t.id } });

  // 8) People + classrooms
  await prisma.teacherProfile.deleteMany({ where: { tenantId: t.id } });
  await prisma.membership.deleteMany({ where: { tenantId: t.id } });
  await prisma.student.deleteMany({ where: { tenantId: t.id } });
  await prisma.classroom.deleteMany({ where: { tenantId: t.id } });

  // 9) Roles
  await prisma.rolePermission.deleteMany({ where: { role: { tenantId: t.id } } });
  await prisma.role.deleteMany({ where: { tenantId: t.id } });

  // 10) Settings
  await prisma.tenantSettings.deleteMany({ where: { tenantId: t.id } });

  // 11) Finally: tenant
  await prisma.tenant.delete({ where: { id: t.id } });

  console.log("\n✅ Tenant deleted:", t.slug);
}

main()
  .catch((e) => {
    console.error("❌ purge-tenant failed:", e?.message ?? e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
