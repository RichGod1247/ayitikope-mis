// src/app/api/consent/optout/student/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanId(v: unknown) {
  return String(v ?? "").trim();
}

function normRole(v: unknown) {
  return String(v ?? "").trim().toUpperCase().replace(/\s+/g, "_");
}

function getIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip") || null;
}

function getUa(req: Request) {
  return req.headers.get("user-agent") || null;
}

type Body = {
  tenantId?: string; // legacy/back-compat only
  studentId?: string;
};

export async function POST(req: Request) {
  // ✅ API auth: NEVER redirects
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SCHOOL_ADMIN", "HEADTEACHER", "TEACHER", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;
  const roleName = normRole(ctx.roleName);

  const body = (await req.json().catch(() => ({}))) as Body;

  const tenantIdFromClient = cleanId(body?.tenantId);
  const studentId = cleanId(body?.studentId);

  if (tenantIdFromClient && tenantIdFromClient !== ctx.tenantId) {
    return json(403, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }
  if (!studentId) return json(400, { ok: false, error: "studentId is required" });
  if (studentId.length > 128) return json(400, { ok: false, error: "Invalid studentId" });

  const tenantId = ctx.tenantId;

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      firstName: true,
      lastName: true,
      guardianSmsOptIn: true,
      healthConsentAt: true,
    },
  });

  if (!student) return json(404, { ok: false, error: "Student not found" });

  // If TEACHER, must have access to the student's classroom
  if (roleName === "TEACHER") {
    const classroomId = cleanId(student.classroomId);
    if (!classroomId) return json(403, { ok: false, error: "FORBIDDEN_NO_CLASSROOM" });

    try {
      await assertCanAccessClassroom({ userId: ctx.userId, tenantId, classroomId });
    } catch (e: any) {
      return json(Number(e?.status) || 403, {
        ok: false,
        error: String(e?.message || "FORBIDDEN"),
      });
    }
  }

  // Idempotent
  if (student.guardianSmsOptIn === false) {
    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: ctx.userId,
          action: "CONSENT_STUDENT_OPTOUT",
          resource: "STUDENT",
          resourceId: studentId,
          ip: getIp(req),
          userAgent: getUa(req),
          metadata: { note: "idempotent", actorRole: roleName } as any,
        },
      });
    } catch {}
    return json(200, { ok: true, student });
  }

  const updated = await prisma.student.update({
    where: { id: studentId },
    data: { guardianSmsOptIn: false },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      firstName: true,
      lastName: true,
      guardianSmsOptIn: true,
      healthConsentAt: true,
    },
  });

  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: ctx.userId,
        action: "CONSENT_STUDENT_OPTOUT",
        resource: "STUDENT",
        resourceId: studentId,
        ip: getIp(req),
        userAgent: getUa(req),
        metadata: {
          before: { guardianSmsOptIn: student.guardianSmsOptIn },
          after: { guardianSmsOptIn: updated.guardianSmsOptIn },
          actorRole: roleName,
        } as any,
      },
    });
  } catch {}

  return json(200, { ok: true, student: updated });
}
