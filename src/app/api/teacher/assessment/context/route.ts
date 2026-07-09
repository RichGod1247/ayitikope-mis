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

  const [settings, teacherProfile, accessibleClassrooms] = await Promise.all([
    prisma.tenantSettings.findUnique({
      where: { tenantId: ctx.tenantId },
      select: { currentTerm: true, currentAcademicYear: true },
    }),
    prisma.teacherProfile.findUnique({
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
    }),
    listUserAccessibleClassrooms({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      roleName: ctx.roleName,
    }),
  ]);

  const term = settings?.currentTerm || "1st Term";
  const academicYear = settings?.currentAcademicYear || "2025/2026";

  let teacherPhase: TeacherPhaseCode = null;
  if (
    teacherProfile?.phase === "KG" ||
    teacherProfile?.phase === "PRIMARY" ||
    teacherProfile?.phase === "JHS"
  ) {
    teacherPhase = teacherProfile.phase;
  }

  // listUserAccessibleClassrooms already applies tenant and teacher/classroom scope.
  // Subject-level enforcement remains in subject-options, overview, scores, and broadsheet APIs.
  // This keeps the context endpoint light while preserving downstream role/tenant controls.
  const classrooms = isAdminLike(ctx.roleName)
    ? await prisma.classroom.findMany({
        where: { tenantId: ctx.tenantId, status: "ACTIVE" },
        orderBy: [{ grade: "asc" }, { name: "asc" }, { arm: "asc" }],
        select: { id: true, name: true, grade: true, arm: true },
      })
    : accessibleClassrooms;

  const defaultClassroomId =
    classrooms.find((c) => c.id === teacherProfile?.primaryClassroomId)?.id ??
    classrooms[0]?.id ??
    null;

  return jsonNoStore(200, {
    ok: true,
    term,
    academicYear,
    teacherPhase,
    defaultClassroomId,
    classrooms,
  });
}
