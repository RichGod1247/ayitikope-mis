// src/app/api/students/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { z } from "zod";
import { StudentStatus } from "@prisma/client";
import { cleanStr, normalizeGhPhoneE164 } from "@/lib/phoneNormGH";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function roleOf(roleName: unknown) {
  return effectiveRole(roleName);
}

function isAdminish(roleName: unknown) {
  const r = roleOf(roleName);
  return (
    r === "SUPERADMIN" ||
    r === "SCHOOL_ADMIN" ||
    r === "SCHOOLADMIN" ||
    r === "ADMIN" ||
    r === "HEADTEACHER"
  );
}

function isTeacherReadOk(roleName: unknown) {
  const r = roleOf(roleName);
  return r === "TEACHER" || isAdminish(r);
}

function isAdminWriteOk(roleName: unknown) {
  return isAdminish(roleName); // writes are admin/headteacher only
}

const PatchSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    sex: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    dob: z.string().nullable().optional(),
    guardianName: z.string().nullable().optional(),
    guardianPhone: z.string().nullable().optional(),
    guardianSmsOptIn: z.boolean().optional(),
    healthConsentAt: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    classroomId: z.string().nullable().optional(),
    status: z.enum(["ACTIVE", "ARCHIVED"]).optional(),
  })
  .strict();

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  if (!isTeacherReadOk(auth.ctx.roleName)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN" });
  }

  const url = new URL(req.url);
  const includeArchived = cleanStr(url.searchParams.get("includeArchived")) === "1";
  const canSeeArchived = isAdminish(auth.ctx.roleName);

  const whereStatus = includeArchived && canSeeArchived ? undefined : StudentStatus.ACTIVE;

  // Teacher-safe selection (no guardian details)
  const selectTeacher = {
    id: true,
    status: true,
    firstName: true,
    lastName: true,
    sex: true,
    gender: true,
    dob: true,
    classroomId: true,
    archivedAt: true,
    createdAt: true,
    updatedAt: true,
    classroom: { select: { id: true, name: true, grade: true, arm: true } },
  };

  const selectAdmin = {
    ...selectTeacher,
    guardianName: true,
    guardianPhone: true,
    guardianPhoneNorm: true,
    guardianSmsOptIn: true,
    healthConsentAt: true,
    note: true,
  };

  const student = await prisma.student.findFirst({
    where: {
      id: params.id,
      tenantId: auth.ctx.tenantId,
      ...(whereStatus ? { status: whereStatus } : {}),
    },
    select: isAdminish(auth.ctx.roleName) ? (selectAdmin as any) : (selectTeacher as any),
  });

  if (!student) return noStoreJson(404, { ok: false, error: "NOT_FOUND" });
  return noStoreJson(200, { ok: true, item: student });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  if (!isAdminWriteOk(auth.ctx.roleName)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN" });
  }

  const raw = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(raw);
  if (!parsed.success) {
    return noStoreJson(400, { ok: false, error: parsed.error.issues[0]?.message || "Invalid body." });
  }

  const existing = await prisma.student.findFirst({
    where: { id: params.id, tenantId: auth.ctx.tenantId },
    select: { id: true, status: true },
  });
  if (!existing) return noStoreJson(404, { ok: false, error: "NOT_FOUND" });

  const data: any = {};

  if (typeof parsed.data.firstName === "string") data.firstName = cleanStr(parsed.data.firstName) || null;
  if (typeof parsed.data.lastName === "string") data.lastName = cleanStr(parsed.data.lastName) || null;

  if (parsed.data.sex !== undefined) data.sex = parsed.data.sex ? cleanStr(parsed.data.sex) : null;
  if (parsed.data.gender !== undefined) data.gender = parsed.data.gender ? cleanStr(parsed.data.gender) : null;

  if (parsed.data.note !== undefined) data.note = parsed.data.note ? cleanStr(parsed.data.note) : null;
  if (parsed.data.guardianName !== undefined) data.guardianName = parsed.data.guardianName ? cleanStr(parsed.data.guardianName) : null;

  if (parsed.data.guardianPhone !== undefined) {
    const phone = parsed.data.guardianPhone ? cleanStr(parsed.data.guardianPhone) : "";
    if (!phone) {
      data.guardianPhone = null;
      data.guardianPhoneNorm = null;
    } else {
      const norm = normalizeGhPhoneE164(phone);
      if (!norm) return noStoreJson(400, { ok: false, error: "INVALID_GUARDIAN_PHONE_GH" });
      data.guardianPhone = phone;
      data.guardianPhoneNorm = norm;
    }
  }

  if (parsed.data.guardianSmsOptIn !== undefined) {
    data.guardianSmsOptIn = Boolean(parsed.data.guardianSmsOptIn);
  }

  if (parsed.data.healthConsentAt !== undefined) {
    if (!parsed.data.healthConsentAt) data.healthConsentAt = null;
    else {
      const d = new Date(String(parsed.data.healthConsentAt));
      if (Number.isNaN(d.getTime())) return noStoreJson(400, { ok: false, error: "INVALID_HEALTH_CONSENT_AT" });
      data.healthConsentAt = d;
    }
  }

  if (parsed.data.dob !== undefined) {
    if (parsed.data.dob === null || parsed.data.dob === "") data.dob = null;
    else {
      const d = new Date(String(parsed.data.dob));
      if (Number.isNaN(d.getTime())) return noStoreJson(400, { ok: false, error: "INVALID_DOB" });
      data.dob = d;
    }
  }

  if (parsed.data.classroomId !== undefined) {
    const classroomId = parsed.data.classroomId ? cleanStr(parsed.data.classroomId) : "";
    if (!classroomId) data.classroomId = null;
    else {
      const ok = await prisma.classroom.findFirst({
        where: { id: classroomId, tenantId: auth.ctx.tenantId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!ok) return noStoreJson(400, { ok: false, error: "INVALID_CLASSROOM" });
      data.classroomId = classroomId;
    }
  }

  if (parsed.data.status) {
    const nextStatus = parsed.data.status as StudentStatus;
    data.status = nextStatus;

    if (nextStatus === StudentStatus.ARCHIVED) {
      data.archivedAt = new Date();
      data.classroomId = null; // remove from roster
    } else {
      data.archivedAt = null;
    }
  }

  const updated = await prisma.student.update({
    where: { id: params.id },
    data,
    select: { id: true, status: true, classroomId: true, archivedAt: true, updatedAt: true },
  });

  return noStoreJson(200, { ok: true, item: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  if (!isAdminWriteOk(auth.ctx.roleName)) {
    return noStoreJson(403, { ok: false, error: "FORBIDDEN" });
  }

  // Soft-delete only: archive
  const s = await prisma.student.findFirst({
    where: { id: params.id, tenantId: auth.ctx.tenantId },
    select: { id: true, status: true },
  });
  if (!s) return noStoreJson(404, { ok: false, error: "NOT_FOUND" });

  if (s.status !== StudentStatus.ARCHIVED) {
    await prisma.student.update({
      where: { id: s.id },
      data: { status: StudentStatus.ARCHIVED, archivedAt: new Date(), classroomId: null },
      select: { id: true },
    });
  }

  return noStoreJson(200, { ok: true });
}