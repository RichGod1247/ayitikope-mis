// src/app/api/admin/students/bulk-import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { StudentStatus } from "@prisma/client";
import { normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import { parseStudentDateOfBirth } from "@/lib/studentDateOfBirth";
import {
  buildClassroomLookup,
  buildStudentDuplicateKey,
  resolveClassroomId,
  type ParsedBulkStudentRow,
} from "@/lib/studentImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function normalizeRoleName(role: unknown) {
  return String(role ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/[^A-Z_]/g, "");
}

function effectiveRole(role: unknown) {
  const r = normalizeRoleName(role);
  if (r === "ADMIN") return "SCHOOL_ADMIN";
  if (r === "HEADMASTER") return "HEADTEACHER";
  return r;
}

function isAdminLike(role: unknown) {
  const r = effectiveRole(role);
  return r === "SCHOOL_ADMIN" || r === "HEADTEACHER" || r.includes("OWNER") || r.includes("SUPER");
}

function clean(v: unknown, maxLen = 160) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}
function optional(v: unknown, maxLen = 160) {
  const s = clean(v, maxLen);
  return s ? s : null;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  const member = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: auth.ctx.userId, tenantId: auth.ctx.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!member || member.status !== "ACTIVE" || !isAdminLike(member.role?.name ?? "")) {
    return json(403, { ok: false, error: "FORBIDDEN" });
  }

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "CONTENT_TYPE_MUST_BE_JSON" });
  }

  const body = (await req.json().catch(() => ({}))) as { rows?: ParsedBulkStudentRow[] };
  const rows = Array.isArray(body.rows) ? body.rows : [];
  if (!rows.length) return json(400, { ok: false, error: "NO_ROWS_PROVIDED" });
  if (rows.length > 1000) return json(400, { ok: false, error: "TOO_MANY_ROWS_MAX_1000" });

  const classrooms = await prisma.classroom.findMany({
    where: { tenantId: auth.ctx.tenantId, status: "ACTIVE" },
    select: { id: true, name: true, grade: true, arm: true },
    take: 500,
  });
  const classroomLookup = buildClassroomLookup(classrooms);

  // duplicate protection against “double submit”
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const recentStudents = await prisma.student.findMany({
    where: { tenantId: auth.ctx.tenantId, status: StudentStatus.ACTIVE, createdAt: { gte: twoMinutesAgo } },
    select: { firstName: true, lastName: true, classroomId: true, guardianName: true, guardianPhoneNorm: true },
    take: 5000,
  });

  const recentKeys = new Set(
    recentStudents.map((s) =>
      buildStudentDuplicateKey({
        firstName: s.firstName ?? "",
        lastName: s.lastName ?? "",
        classroomId: s.classroomId ?? null,
        guardianName: s.guardianName ?? null,
        guardianPhoneNorm: s.guardianPhoneNorm ?? null,
      })
    )
  );

  const batchKeys = new Set<string>();
  const errors: Array<{ rowNumber: number; error: string }> = [];

  let invalidCount = 0;
  let duplicateCount = 0;

  const toCreate: Array<{
    tenantId: string;
    status: StudentStatus;
    firstName: string;
    lastName: string;
    guardianName: string | null;
    guardianPhone: string | null;
    guardianPhoneNorm: string | null;
    dateOfBirth: Date | null;
    gender: string | null;
    note: string | null;
    classroomId: string | null;
    archivedAt: null;
  }> = [];

  for (const raw of rows) {
    const rowNumber = Number(raw?.rowNumber || 0) || 0;

    const firstName = clean(raw?.firstName, 80);
    const lastName = clean(raw?.lastName, 80);
    const guardianName = optional(raw?.guardianName, 120);
    const guardianPhone = optional(raw?.guardianPhone, 32);
    const dateOfBirthRaw = optional(raw?.dateOfBirth, 10);
    const classLabel = optional(raw?.classLabel, 80);
    const gender = optional(raw?.gender, 32);
    const note = optional(raw?.note, 500);

    if (!firstName || !lastName) {
      invalidCount += 1;
      errors.push({ rowNumber: rowNumber || errors.length + 2, error: "MISSING_NAME" });
      continue;
    }

    const guardianPhoneNorm = guardianPhone ? normalizeGhPhoneE164(guardianPhone) : null;
    if (guardianPhone && !guardianPhoneNorm) {
      invalidCount += 1;
      errors.push({ rowNumber: rowNumber || errors.length + 2, error: "INVALID_GUARDIAN_PHONE_GH" });
      continue;
    }

    const dateOfBirth = parseStudentDateOfBirth(dateOfBirthRaw);
    if (!dateOfBirth.ok) {
      invalidCount += 1;
      errors.push({ rowNumber: rowNumber || errors.length + 2, error: dateOfBirth.error });
      continue;
    }

    const classResolved = resolveClassroomId(classLabel, classroomLookup);
    if (classResolved.error) {
      invalidCount += 1;
      errors.push({ rowNumber: rowNumber || errors.length + 2, error: classResolved.error });
      continue;
    }

    const dupKey = buildStudentDuplicateKey({
      firstName,
      lastName,
      classroomId: classResolved.classroomId,
      guardianName,
      guardianPhoneNorm,
    });

    if (batchKeys.has(dupKey)) {
      duplicateCount += 1;
      errors.push({ rowNumber: rowNumber || errors.length + 2, error: "DUPLICATE_IN_BATCH" });
      continue;
    }

    if (recentKeys.has(dupKey)) {
      duplicateCount += 1;
      errors.push({ rowNumber: rowNumber || errors.length + 2, error: "DUPLICATE_RECENTLY_IMPORTED" });
      continue;
    }

    batchKeys.add(dupKey);

    toCreate.push({
      tenantId: auth.ctx.tenantId,
      status: StudentStatus.ACTIVE,
      firstName,
      lastName,
      guardianName,
      guardianPhone,
      guardianPhoneNorm,
      dateOfBirth: dateOfBirth.value,
      gender,
      note,
      classroomId: classResolved.classroomId,
      archivedAt: null,
    });
  }

  try {
    const createdCount = await prisma.$transaction(async (tx) => {
      const created = await tx.student.createMany({ data: toCreate });
      try {
        await tx.auditLog.create({
          data: {
            tenantId: auth.ctx.tenantId,
            userId: auth.ctx.userId,
            action: "STUDENT_BULK_IMPORT",
            resource: "Student",
            resourceId: null,
            metadata: { totalRows: rows.length, importedCount: created.count, invalidCount, duplicateCount } as any,
          },
        });
      } catch {}
      return created.count;
    });

    return json(200, {
      ok: true,
      totalRows: rows.length,
      importedCount: createdCount,
      invalidCount,
      duplicateCount,
      errors: errors.slice(0, 200),
    });
  } catch (e: any) {
    console.error("[STUDENT_BULK_IMPORT_ERROR]", e);
    return json(500, { ok: false, error: "FAILED_TO_IMPORT_STUDENTS" });
  }
}