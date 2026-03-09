//src/app/api/teacher/assessment/class-average/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { isAdminLikeRole, resolveUserClassroomAccess } from "@/lib/teacherAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isForbiddenReason(reason: string) {
  return reason === "OUT_OF_SCOPE" || reason === "SUBJECT_OUT_OF_SCOPE";
}

function buildSubjectWhere(args: { roleName: string | null; allowedSubjects: string[] | null }) {
  if (isAdminLikeRole(args.roleName)) return {};
  if (args.allowedSubjects?.length) {
    return {
      OR: args.allowedSubjects.map((s) => ({
        subject: { equals: s, mode: "insensitive" as const },
      })),
    };
  }
  return {};
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const tenantIdParam = searchParams.get("tenantId");
  if (tenantIdParam && tenantIdParam !== ctx.tenantId) {
    return noStore(403, { ok: false, error: "TENANT_MISMATCH" });
  }

  const classroomId = (searchParams.get("classroomId") ?? "").trim();
  const term = (searchParams.get("term") ?? "1st Term").trim();
  const academicYear = (searchParams.get("academicYear") ?? "2025/2026").trim();

  if (!classroomId) {
    return noStore(400, { ok: false, error: "Missing required query param: classroomId." });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: isForbiddenReason(access.reason) ? access.reason : "CLASSROOM_NOT_FOUND",
    });
  }

  const subjectWhere = buildSubjectWhere({
    roleName: ctx.roleName,
    allowedSubjects: access.allowedSubjects,
  });

  const items = await prisma.assessmentItem.findMany({
    where: { tenantId: ctx.tenantId, classroomId, term, academicYear, ...subjectWhere } as any,
    select: { id: true, maxScore: true },
  });

  if (items.length === 0) {
    return noStore(200, {
      ok: true,
      context: { tenantId: ctx.tenantId, classroomId, term, academicYear },
      averagePercent: null,
      learnersCount: 0,
      itemsCount: 0,
    });
  }

  const itemMaxMap = new Map<string, number>();
  const itemIds: string[] = [];

  for (const it of items) {
    itemIds.push(it.id);
    itemMaxMap.set(it.id, Number(it.maxScore ?? 0));
  }

  const scores = await prisma.assessmentScore.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, studentId: true, score: true },
  });

  if (scores.length === 0) {
    return noStore(200, {
      ok: true,
      context: { tenantId: ctx.tenantId, classroomId, term, academicYear },
      averagePercent: null,
      learnersCount: 0,
      itemsCount: items.length,
    });
  }

  let totalScore = 0;
  let totalMax = 0;
  const learnerIds = new Set<string>();

  for (const s of scores) {
    learnerIds.add(s.studentId);
    const max = itemMaxMap.get(s.itemId) ?? 0;
    if (max <= 0) continue;
    totalMax += max;
    totalScore += Number(s.score ?? 0);
  }

  const averagePercent = totalMax > 0 ? (totalScore / totalMax) * 100 : null;

  return noStore(200, {
    ok: true,
    context: { tenantId: ctx.tenantId, classroomId, term, academicYear },
    averagePercent,
    learnersCount: learnerIds.size,
    itemsCount: items.length,
  });
}