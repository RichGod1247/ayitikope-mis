//src/app/api/teacher/assessment/context/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { listUserAccessibleClassrooms } from "@/lib/teacherAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type TeacherPhaseCode = "KG" | "PRIMARY" | "JHS" | null;

function jsonNoStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isAdminLike(role: string | null) {
  const r = String(role || "").toUpperCase();
  return r === "ADMIN" || r === "SCHOOL_ADMIN" || r === "HEADTEACHER" || r === "SUPERADMIN";
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;

  const settings = await prisma.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { currentTerm: true, currentAcademicYear: true },
  });

  const term = settings?.currentTerm || "1st Term";
  const academicYear = settings?.currentAcademicYear || "2025/2026";

  const classrooms = await listUserAccessibleClassrooms({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
  });

  let defaultClassroomId: string | null = classrooms[0]?.id ?? null;
  let teacherPhase: TeacherPhaseCode = null;

  const tp = await prisma.teacherProfile.findUnique({
    where: {
      teacherProfile_tenant_user_unique: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      },
    },
    select: {
      phase: true,
      primaryClassroomId: true,
    },
  });

  if (tp?.phase === "KG" || tp?.phase === "PRIMARY" || tp?.phase === "JHS") {
    teacherPhase = tp.phase;
  }

  if (classrooms.length > 0 && tp?.primaryClassroomId) {
    if (classrooms.some((c) => c.id === tp.primaryClassroomId)) {
      defaultClassroomId = tp.primaryClassroomId;
    }
  }

  // Admin-like users still get all active classrooms, but teacherPhase remains null unless
  // they actually have a TeacherProfile. The client uses this only for display behavior.
  if (isAdminLike(ctx.roleName)) {
    const adminClassrooms = await prisma.classroom.findMany({
      where: { tenantId: ctx.tenantId, status: "ACTIVE" },
      orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
      select: { id: true, name: true, grade: true, arm: true },
    });

    return jsonNoStore(200, {
      ok: true,
      term,
      academicYear,
      teacherPhase,
      defaultClassroomId:
        adminClassrooms.find((c) => c.id === defaultClassroomId)?.id ??
        adminClassrooms[0]?.id ??
        null,
      classrooms: adminClassrooms,
    });
  }

  return jsonNoStore(200, {
    ok: true,
    term,
    academicYear,
    teacherPhase,
    defaultClassroomId,
    classrooms,
  });
}