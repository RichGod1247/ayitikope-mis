// src/app/api/teacher/insights/student/route.ts
import { NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { resolveUserClassroomAccess } from "@/lib/teacherAccess";
import { computeStudentSwot } from "@/lib/insights/aggregates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function isForbiddenReason(reason: string) {
  return reason === "OUT_OF_SCOPE" || reason === "SUBJECT_OUT_OF_SCOPE";
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const classroomId = cleanStr(searchParams.get("classroomId"));
  const studentId = cleanStr(searchParams.get("studentId"));
  const term = cleanStr(searchParams.get("term")) || "1st Term";
  const academicYear = cleanStr(searchParams.get("academicYear")) || "2025/2026";
  const attendanceDays = Number(searchParams.get("attendanceDays") ?? 30);

  if (!classroomId) return noStore(400, { ok: false, error: "MISSING_CLASSROOM_ID" });
  if (!studentId) return noStore(400, { ok: false, error: "MISSING_STUDENT_ID" });

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: access.reason,
    });
  }

  const swot = await computeStudentSwot({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
    studentId,
    term,
    academicYear,
    allowedSubjects: access.allowedSubjects,
    attendanceDays: Number.isFinite(attendanceDays) ? attendanceDays : 30,
  });

  return noStore(200, { ok: true, swot });
}