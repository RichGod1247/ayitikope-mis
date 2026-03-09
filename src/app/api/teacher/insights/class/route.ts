// src/app/api/teacher/insights/class/route.ts
import { NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { resolveUserClassroomAccess } from "@/lib/teacherAccess";
import { computeTeacherClassInsights, rulesTeacherActions } from "@/lib/insights/aggregates";

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
  const term = cleanStr(searchParams.get("term")) || "1st Term";
  const academicYear = cleanStr(searchParams.get("academicYear")) || "2025/2026";
  const attendanceDays = Number(searchParams.get("attendanceDays") ?? 30);

  if (!classroomId) return noStore(400, { ok: false, error: "MISSING_CLASSROOM_ID" });

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

  const metrics = await computeTeacherClassInsights({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
    term,
    academicYear,
    allowedSubjects: access.allowedSubjects,
    scopeSource: access.scopeSource,
    attendanceDays: Number.isFinite(attendanceDays) ? attendanceDays : 30,
  });

  const actions = rulesTeacherActions(metrics);

  return noStore(200, { ok: true, metrics, actions });
}