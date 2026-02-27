// src/app/api/students/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { effectiveRole } from "@/lib/roleRouting";
import { StudentStatus } from "@prisma/client";
import { z } from "zod";
import { normalizeGhPhoneE164, cleanStr } from "@/lib/phoneNormGH";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isAdminLike(role: string) {
  return role === "SUPERADMIN" || role === "SCHOOL_ADMIN" || role === "HEADTEACHER";
}

const CreateSchema = z
  .object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    sex: z.string().nullable().optional(),
    dob: z.string().nullable().optional(),
    guardianName: z.string().nullable().optional(),
    guardianPhone: z.string().nullable().optional(),
    note: z.string().nullable().optional(),
    classroomId: z.string().nullable().optional(),
  })
  .strict();

// GET /api/students?classroomId=&q=&take=&includeArchived=
export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const role = effectiveRole(auth.ctx.roleName ?? "");

  const { searchParams } = new URL(req.url);
  const classroomId = cleanStr(searchParams.get("classroomId"));
  const q = cleanStr(searchParams.get("q")).toLowerCase();
  const takeRaw = Number(cleanStr(searchParams.get("take")) || "200");
  const take = Number.isFinite(takeRaw) ? Math.max(1, Math.min(200, takeRaw)) : 200;

  const includeArchived = cleanStr(searchParams.get("includeArchived")) === "1" && isAdminLike(role);

  const where: any = { tenantId };
  if (!includeArchived) where.status = StudentStatus.ACTIVE;
  if (classroomId) where.classroomId = classroomId;

  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
    ];
    // admin/headteacher can also search by guardian phone/name
    if (isAdminLike(role)) {
      where.OR.push(
        { guardianName: { contains: q, mode: "insensitive" } },
        { guardianPhone: { contains: q, mode: "insensitive" } }
      );
    }
  }

  // Privacy: teachers get reduced fields (no guardian phone)
  const selectTeacher = {
    id: true,
    status: true,
    firstName: true,
    lastName: true,
    sex: true,
    dob: true,
    classroomId: true,
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
    createdAt: true,
    updatedAt: true,
  };

  const items = await prisma.student.findMany({
    where,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: isAdminLike(role) ? (selectAdmin as any) : (selectTeacher as any),
    take,
  });

  return noStoreJson(200, { ok: true, count: items.length, items });
}

// POST /api/students (admin-like only)
export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  const tenantId = auth.ctx.tenantId;
  const role = effectiveRole(auth.ctx.roleName ?? "");
  if (!isAdminLike(role)) return noStoreJson(403, { ok: false, error: "FORBIDDEN" });

  const raw = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(raw);
  if (!parsed.success) return noStoreJson(400, { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid body." });

  const firstName = cleanStr(parsed.data.firstName);
  const lastName = cleanStr(parsed.data.lastName);

  const guardianName = parsed.data.guardianName ? cleanStr(parsed.data.guardianName) : null;
  const guardianPhone = parsed.data.guardianPhone ? cleanStr(parsed.data.guardianPhone) : null;
  const note = parsed.data.note ? cleanStr(parsed.data.note) : null;

  const classroomId = parsed.data.classroomId ? cleanStr(parsed.data.classroomId) : null;

  if (classroomId) {
    const ok = await prisma.classroom.findFirst({ where: { id: classroomId, tenantId }, select: { id: true } });
    if (!ok) return noStoreJson(400, { ok: false, error: "Invalid classroomId for this tenant." });
  }

  let dob: Date | null = null;
  if (parsed.data.dob) {
    const d = new Date(String(parsed.data.dob));
    if (!Number.isNaN(d.getTime())) dob = d;
  }

  // Enforce norm if guardianPhone provided
  let guardianPhoneNorm: string | null = null;
  if (guardianPhone) {
    guardianPhoneNorm = normalizeGhPhoneE164(guardianPhone);
    if (!guardianPhoneNorm) return noStoreJson(400, { ok: false, error: "INVALID_GUARDIAN_PHONE_GH" });
  }

  const created = await prisma.student.create({
    data: {
      tenantId,
      status: StudentStatus.ACTIVE,
      classroomId,
      firstName,
      lastName,
      sex: parsed.data.sex ? cleanStr(parsed.data.sex) : null,
      dob,
      guardianName,
      guardianPhone,
      guardianPhoneNorm,
      note,
    },
    select: {
      id: true,
      status: true,
      firstName: true,
      lastName: true,
      classroomId: true,
      guardianName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
      createdAt: true,
    },
  });

  return noStoreJson(201, {
    ok: true,
    item: { ...created, createdAt: created.createdAt.toISOString() },
  });
}