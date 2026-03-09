// src/app/api/teacher/assessment/term-dashboard/route.ts
import { NextResponse } from "next/server";
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

function gesGradeFromPercentage(pct: number | null | undefined) {
  if (pct == null || Number.isNaN(pct)) return null;
  if (pct >= 90) return { grade: 1, remark: "Excellent" };
  if (pct >= 80) return { grade: 2, remark: "Very Good" };
  if (pct >= 70) return { grade: 3, remark: "Good" };
  if (pct >= 60) return { grade: 4, remark: "High Average" };
  if (pct >= 55) return { grade: 5, remark: "Average" };
  if (pct >= 50) return { grade: 6, remark: "Low Average" };
  if (pct >= 40) return { grade: 7, remark: "Low" };
  if (pct >= 35) return { grade: 8, remark: "Lower" };
  return { grade: 9, remark: "Lowest / Fail" };
}

function buildSubjectWhere(args: { roleName: string | null; allowedSubjects: string[] | null }) {
  if (isAdminLikeRole(args.roleName)) return {};
  if (args.allowedSubjects?.length) {
    return { OR: args.allowedSubjects.map((s) => ({ subject: { equals: s, mode: "insensitive" as const } })) };
  }
  return {};
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res as any;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const classroomId = (searchParams.get("classroomId") ?? "").trim();
  const term = (searchParams.get("term") ?? "1st Term").trim();
  const academicYear = (searchParams.get("academicYear") ?? "2025/2026").trim();

  if (!classroomId) return noStore(400, { ok: false, error: "MISSING_CLASSROOM_ID" });

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, { ok: false, error: access.reason });
  }

  const subjectWhere = buildSubjectWhere({ roleName: ctx.roleName, allowedSubjects: access.allowedSubjects });

  const learners = await prisma.student.findMany({
    where: { tenantId: ctx.tenantId, classroomId, status: "ACTIVE" },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { createdAt: "asc" }],
    select: { id: true, firstName: true, lastName: true, guardianPhone: true },
  });

  const items = await prisma.assessmentItem.findMany({
    where: { tenantId: ctx.tenantId, classroomId, term, academicYear, ...subjectWhere } as any,
    select: { id: true, maxScore: true },
  });

  const itemMax = new Map<string, number>();
  const itemIds: string[] = [];
  for (const it of items) {
    itemIds.push(it.id);
    itemMax.set(it.id, Number(it.maxScore ?? 0));
  }

  const scores = itemIds.length
    ? await prisma.assessmentScore.findMany({
        where: { itemId: { in: itemIds } },
        select: { itemId: true, studentId: true, score: true },
      })
    : [];

  const perLearner = new Map<string, { totalScore: number; totalMax: number; itemsCount: number }>();
  let classTotalScore = 0;
  let classTotalMax = 0;

  for (const s of scores) {
    const max = itemMax.get(s.itemId) ?? 0;
    if (max <= 0) continue;

    const prev = perLearner.get(s.studentId) ?? { totalScore: 0, totalMax: 0, itemsCount: 0 };
    prev.totalScore += Number(s.score ?? 0);
    prev.totalMax += max;
    prev.itemsCount += 1;
    perLearner.set(s.studentId, prev);

    classTotalScore += Number(s.score ?? 0);
    classTotalMax += max;
  }

  const learnerRows = learners.map((l) => {
    const agg = perLearner.get(l.id) ?? { totalScore: 0, totalMax: 0, itemsCount: 0 };
    const pct = agg.totalMax > 0 ? (agg.totalScore / agg.totalMax) * 100 : null;
    const g = gesGradeFromPercentage(pct ?? undefined);

    return {
      studentId: l.id,
      fullName: `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || "Learner",
      guardianPhone: l.guardianPhone ?? null,
      itemsCount: agg.itemsCount,
      totalScore: agg.totalScore,
      totalMax: agg.totalMax,
      percentage: pct,
      grade: g?.grade ?? null,
      remark: g?.remark ?? null,
    };
  });

  const classPct = classTotalMax > 0 ? (classTotalScore / classTotalMax) * 100 : null;
  const classG = gesGradeFromPercentage(classPct ?? undefined);

  return noStore(200, {
    ok: true,
    classroom: access.classroom,
    learners: learnerRows,
    classAverage: {
      percentage: classPct,
      grade: classG?.grade ?? null,
      remark: classG?.remark ?? null,
      totalScore: classTotalScore,
      totalMax: classTotalMax,
    },
  });
}