// src/app/api/me/profile/teacher/route.ts
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  normalizeJhsAssignmentsLoose,
  normalizeTeacherClassLevel,
  normalizeTeacherScopeForRead,
  sameNormalizedJhsAssignments,
} from "@/lib/teacherScope";
import { replaceTeacherAssessmentAssignmentsForProfile } from "@/lib/assessments/teacherAssignmentSync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TeacherPhase = "KG" | "PRIMARY" | "JHS";
type FieldErrors = Record<string, string>;

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function jsonFail(msg: string, status = 400, fieldErrors?: FieldErrors) {
  return NextResponse.json(
    { ok: false, error: msg, fieldErrors: fieldErrors ?? null },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function jsonOk(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function normalizePhone(raw: unknown): string | null {
  const s = cleanStr(raw).replace(/\s+/g, "");
  if (!s) return null;

  let p = s.replace(/[^\d+]/g, "");
  if (!p) return null;

  if (p.startsWith("0") && p.length === 10) p = `+233${p.slice(1)}`;
  if (p.startsWith("233") && !p.startsWith("+233")) p = `+${p}`;

  if (!/^\+\d{9,15}$/.test(p)) return null;
  return p;
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER"],
  });
  if (!auth.ok) return auth.res;

  const { userId, tenantId, roleName } = auth.ctx;

  const [user, tp] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true, phoneNorm: true },
    }),
    prisma.teacherProfile.findUnique({
      where: { teacherProfile_tenant_user_unique: { tenantId, userId } },
      select: {
        id: true,
        tenantId: true,
        userId: true,
        phone: true,
        phase: true,
        classLevel: true,
        jhsAssignments: true,
        additionalDuties: true,
        primaryClassroomId: true,
      },
    }),
  ]);

  return jsonOk({
    ok: true,
    tenantId,
    roleName,
    user: {
      id: user?.id ?? userId,
      email: user?.email ?? null,
      name: user?.name ?? null,
      phone: user?.phone ?? null,
      phoneNorm: user?.phoneNorm ?? null,
    },
    teacherProfile: tp
      ? normalizeTeacherScopeForRead({
          ...tp,
          additionalDuties: Array.isArray(tp.additionalDuties) ? tp.additionalDuties : [],
        })
      : null,
  });
}

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER"],
  });
  if (!auth.ok) return auth.res;

  const { userId, tenantId } = auth.ctx;

  const body = (await req.json().catch(() => null)) as any;
  if (!body) return jsonFail("INVALID_PAYLOAD", 400);

  const fieldErrors: FieldErrors = {};

  const phoneNorm = normalizePhone(body.phone);
  if (!phoneNorm) fieldErrors.phone = "Invalid phone. Use 024xxxxxxx or +233xxxxxxxxx.";

  const phaseRaw = cleanStr(body.phase) as TeacherPhase;
  const phase: TeacherPhase | null =
    phaseRaw === "KG" || phaseRaw === "PRIMARY" || phaseRaw === "JHS" ? phaseRaw : null;
  if (!phase) fieldErrors.phase = "Phase must be KG, PRIMARY, or JHS.";

  const classLevel =
    phase === "KG" || phase === "PRIMARY"
      ? normalizeTeacherClassLevel(phase, body.classLevel)
      : null;

  if ((phase === "KG" || phase === "PRIMARY") && !classLevel) {
    fieldErrors.classLevel = "Use KG 1, KG 2, or B1-B6.";
  }

  const normalizedJhsAssignments =
    phase === "JHS" ? normalizeJhsAssignmentsLoose(body.jhsAssignments) : [];

  if (phase === "JHS" && normalizedJhsAssignments.length === 0) {
    fieldErrors.jhsAssignments = "Add at least one valid JHS subject assignment.";
  }

  const additionalDuties = Array.isArray(body.additionalDuties)
    ? body.additionalDuties.map((x: unknown) => cleanStr(x)).filter(Boolean)
    : [];

  if (Object.keys(fieldErrors).length) return jsonFail("VALIDATION_FAILED", 400, fieldErrors);

  const clash = await prisma.user.findFirst({
    where: { phoneNorm: phoneNorm!, NOT: { id: userId } },
    select: { id: true },
  });
  if (clash?.id) {
    return jsonFail("PHONE_IN_USE", 409, {
      phone: "This phone number is already used by another account.",
    });
  }

  const existingProfile = await prisma.teacherProfile.findUnique({
    where: { teacherProfile_tenant_user_unique: { tenantId, userId } },
    select: {
      id: true,
      phase: true,
      classLevel: true,
      jhsAssignments: true,
    },
  });

  if (existingProfile) {
    if (existingProfile.phase !== phase) {
      return jsonFail("SCOPE_ALREADY_LOCKED", 409);
    }

    if (
      (phase === "KG" || phase === "PRIMARY") &&
      normalizeTeacherClassLevel(phase, existingProfile.classLevel) !== classLevel
    ) {
      return jsonFail("SCOPE_ALREADY_LOCKED", 409, {
        classLevel: "Teaching scope is locked for this account.",
      });
    }

    if (
      phase === "JHS" &&
      !sameNormalizedJhsAssignments(existingProfile.jhsAssignments, normalizedJhsAssignments)
    ) {
      return jsonFail("SCOPE_ALREADY_LOCKED", 409, {
        jhsAssignments: "Teaching scope is locked for this account.",
      });
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { phone: phoneNorm!, phoneNorm: phoneNorm! },
      });

            const savedProfile = await tx.teacherProfile.upsert({
        where: { teacherProfile_tenant_user_unique: { tenantId, userId } },
        create: {
          tenantId,
          userId,
          phone: phoneNorm!,
          phase: phase!,
          classLevel: phase === "KG" || phase === "PRIMARY" ? classLevel : null,
          jhsAssignments:
            phase === "JHS"
              ? (normalizedJhsAssignments as Prisma.InputJsonValue)
              : Prisma.DbNull,
          additionalDuties,
        },
        update: {
          phone: phoneNorm!,
          phase: phase!,
          classLevel: phase === "KG" || phase === "PRIMARY" ? classLevel : null,
          jhsAssignments:
            phase === "JHS"
              ? (normalizedJhsAssignments as Prisma.InputJsonValue)
              : Prisma.DbNull,
          additionalDuties,
        },
        select: {
          primaryClassroomId: true,
        },
      });

      await replaceTeacherAssessmentAssignmentsForProfile({
        tx,
        tenantId,
        teacherUserId: userId,
        phase: phase!,
        classLevel: phase === "KG" || phase === "PRIMARY" ? classLevel : null,
        primaryClassroomId: savedProfile.primaryClassroomId ?? null,
        jhsAssignments:
          phase === "JHS"
            ? normalizedJhsAssignments.map((a) => ({
                subject: a.subject,
                classes: a.classes,
              }))
            : [],
        createdByUserId: userId,
        reason: "Teacher updated own profile scope.",
      });
    });

    return await GET(req);
  } catch (err) {
    console.error("TEACHER_ME_PROFILE_SAVE_ERROR", err);
    return jsonFail("SAVE_FAILED", 500);
  }
}