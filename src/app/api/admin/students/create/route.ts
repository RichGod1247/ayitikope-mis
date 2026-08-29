// src/app/api/admin/students/create/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { StudentStatus } from "@prisma/client";
import { z } from "zod";
import { cleanStr, normalizeGhPhoneE164 } from "@/lib/phoneNormGH";
import { parseStudentDateOfBirth } from "@/lib/studentDateOfBirth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ADMIN_ROLES = ["ADMIN", "SCHOOL_ADMIN", "SCHOOLADMIN", "HEADTEACHER", "SUPERADMIN"];

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

const BodySchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    guardianName: z.string().nullable().optional(),
    guardianPhone: z.string().nullable().optional(),
    classroomId: z.string().nullable().optional(),
    gender: z.string().nullable().optional(),
    sex: z.string().nullable().optional(),
    dateOfBirth: z.string().nullable().optional(),
    dob: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .strict();

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ADMIN_ROLES,
  });
  if (!auth.ok) return auth.res;

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return noStoreJson(400, { ok: false, error: parsed.error.issues[0]?.message || "Invalid body." });
  }

  const firstName = cleanStr(parsed.data.firstName) || "";
  const lastName = cleanStr(parsed.data.lastName) || "";
  if (!firstName || !lastName) return noStoreJson(400, { ok: false, error: "MISSING_NAME" });

  const classroomId = parsed.data.classroomId ? cleanStr(parsed.data.classroomId) : "";
  if (classroomId) {
    const ok = await prisma.classroom.findFirst({
      where: { id: classroomId, tenantId: auth.ctx.tenantId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!ok) return noStoreJson(400, { ok: false, error: "INVALID_CLASSROOM" });
  }

  let guardianPhone: string | null = null;
  let guardianPhoneNorm: string | null = null;

  if (parsed.data.guardianPhone != null) {
    const p = cleanStr(parsed.data.guardianPhone);
    if (p) {
      const norm = normalizeGhPhoneE164(p);
      if (!norm) return noStoreJson(400, { ok: false, error: "INVALID_GUARDIAN_PHONE_GH" });
      guardianPhone = p;
      guardianPhoneNorm = norm;
    }
  }


  const dateOfBirth = parseStudentDateOfBirth(parsed.data.dateOfBirth);
  if (!dateOfBirth.ok) {
    return noStoreJson(400, { ok: false, error: dateOfBirth.error });
  }

  let legacyDob: Date | null = null;
  if (parsed.data.dob) {
    const parsedLegacyDob = new Date(String(parsed.data.dob));
    if (Number.isNaN(parsedLegacyDob.getTime())) {
      return noStoreJson(400, { ok: false, error: "INVALID_DOB" });
    }
    legacyDob = parsedLegacyDob;
  }

  const created = await prisma.student.create({
    data: {
      tenantId: auth.ctx.tenantId,
      status: StudentStatus.ACTIVE,
      firstName,
      lastName,
      guardianName: parsed.data.guardianName ? cleanStr(parsed.data.guardianName) : null,
      guardianPhone,
      guardianPhoneNorm,
      gender: parsed.data.gender ? cleanStr(parsed.data.gender) : null,
      sex: parsed.data.sex ? cleanStr(parsed.data.sex) : null,
      dateOfBirth: dateOfBirth.value,
      dob: legacyDob,
      note: parsed.data.note ? cleanStr(parsed.data.note) : null,
      classroomId: classroomId || null,
    },
    select: { id: true, createdAt: true },
  });

  return noStoreJson(201, { ok: true, item: created });
}