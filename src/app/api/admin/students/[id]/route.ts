// src/app/api/admin/students/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { StudentStatus } from "@prisma/client";
import { z } from "zod";
import { cleanStr, normalizeGhPhoneE164 } from "@/lib/phoneNormGH";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["ADMIN", "SCHOOL_ADMIN", "SCHOOLADMIN", "HEADTEACHER", "SUPERADMIN"];

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

const PatchSchema = z
  .object({
    firstName: z.string().nullable().optional(),
    lastName: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    sex: z.string().nullable().optional(),
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
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ADMIN_ROLES,
  });
  if (!auth.ok) return auth.res;

  const item = await prisma.student.findFirst({
    where: { id: params.id, tenantId: auth.ctx.tenantId },
    select: {
      id: true,
      tenantId: true,
      status: true,
      firstName: true,
      lastName: true,
      gender: true,
      sex: true,
      dob: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
      guardianSmsOptIn: true,
      healthConsentAt: true,
      note: true,
      classroomId: true,
      classroom: { select: { id: true, name: true, grade: true, arm: true } },
      archivedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!item) return noStoreJson(404, { ok: false, error: "NOT_FOUND" });
  return noStoreJson(200, { ok: true, item });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ADMIN_ROLES,
  });
  if (!auth.ok) return auth.res;

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

  if (parsed.data.firstName !== undefined) data.firstName = parsed.data.firstName ? cleanStr(parsed.data.firstName) : null;
  if (parsed.data.lastName !== undefined) data.lastName = parsed.data.lastName ? cleanStr(parsed.data.lastName) : null;
  if (parsed.data.gender !== undefined) data.gender = parsed.data.gender ? cleanStr(parsed.data.gender) : null;
  if (parsed.data.sex !== undefined) data.sex = parsed.data.sex ? cleanStr(parsed.data.sex) : null;

  if (parsed.data.dob !== undefined) {
    if (!parsed.data.dob) data.dob = null;
    else {
      const d = new Date(String(parsed.data.dob));
      if (Number.isNaN(d.getTime())) return noStoreJson(400, { ok: false, error: "INVALID_DOB" });
      data.dob = d;
    }
  }

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

  if (parsed.data.guardianSmsOptIn !== undefined) data.guardianSmsOptIn = Boolean(parsed.data.guardianSmsOptIn);

  if (parsed.data.healthConsentAt !== undefined) {
    if (!parsed.data.healthConsentAt) data.healthConsentAt = null;
    else {
      const d = new Date(String(parsed.data.healthConsentAt));
      if (Number.isNaN(d.getTime())) return noStoreJson(400, { ok: false, error: "INVALID_HEALTH_CONSENT_AT" });
      data.healthConsentAt = d;
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
      data.classroomId = null;
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