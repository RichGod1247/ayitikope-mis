// src/app/api/teacher/assessment/student-term-report/route.ts
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

  const studentId = (searchParams.get("studentId") ?? "").trim();
  const term = (searchParams.get("term") ?? "1st Term").trim();
  const academicYear = (searchParams.get("academicYear") ?? "2025/2026").trim();

  if (!studentId) return noStore(400, { ok: false, error: "STUDENT_ID_REQUIRED" });

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      classroomId: true,
    },
  });

  if (!student) return noStore(404, { ok: false, error: "STUDENT_NOT_FOUND" });
  if (!student.classroomId) return noStore(400, { ok: false, error: "STUDENT_HAS_NO_CLASSROOM" });

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId: student.classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, { ok: false, error: access.reason });
  }

  const subjectWhere = buildSubjectWhere({ roleName: ctx.roleName, allowedSubjects: access.allowedSubjects });

  const items = await prisma.assessmentItem.findMany({
    where: {
      tenantId: ctx.tenantId,
      classroomId: student.classroomId,
      term,
      academicYear,
      ...subjectWhere,
    } as any,
    orderBy: [{ subject: "asc" }, { date: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      subject: true,
      title: true,
      type: true,
      date: true,
      maxScore: true,
    },
  });

  const itemIds = items.map((x) => x.id);

  const scores = itemIds.length
    ? await prisma.assessmentScore.findMany({
        where: { itemId: { in: itemIds }, studentId },
        select: { itemId: true, score: true, comment: true },
      })
    : [];

  const scoreMap = new Map<string, { score: number; comment: string | null }>();
  for (const s of scores) scoreMap.set(s.itemId, { score: Number(s.score ?? 0), comment: s.comment ?? null });

  const bySubject = new Map<
    string,
    { subject: string; itemCount: number; recordedItemCount: number; totalScore: number; maxScore: number; items: any[] }
  >();

  for (const it of items) {
    const key = it.subject || "—";
    const grp =
      bySubject.get(key) ??
      { subject: key, itemCount: 0, recordedItemCount: 0, totalScore: 0, maxScore: 0, items: [] };

    grp.itemCount += 1;

    const max = Number(it.maxScore ?? 0);
    const got = scoreMap.get(it.id);

    if (got) {
      grp.recordedItemCount += 1;
      grp.totalScore += got.score;
      grp.maxScore += max;
    }

    const pct = got && max > 0 ? (got.score / max) * 100 : null;

    grp.items.push({
      itemId: it.id,
      title: it.title,
      type: it.type,
      date: it.date ? new Date(it.date).toISOString() : null,
      score: got ? got.score : null,
      maxScore: max,
      percentage: pct,
      comment: got?.comment ?? null,
    });

    bySubject.set(key, grp);
  }

  const subjects = Array.from(bySubject.values()).map((g) => {
    const pct = g.maxScore > 0 ? (g.totalScore / g.maxScore) * 100 : null;
    const gg = gesGradeFromPercentage(pct ?? undefined);
    return {
      subject: g.subject,
      itemCount: g.itemCount,
      recordedItemCount: g.recordedItemCount,
      totalScore: g.totalScore,
      maxScore: g.maxScore,
      percentage: pct,
      grade: gg?.grade ?? null,
      remark: gg?.remark ?? null,
      items: g.items,
    };
  });

  const overallTotals = subjects.reduce(
    (acc, s) => {
      acc.totalScore += Number(s.totalScore ?? 0);
      acc.totalMax += Number(s.maxScore ?? 0);
      return acc;
    },
    { totalScore: 0, totalMax: 0 }
  );

  const overallPct = overallTotals.totalMax > 0 ? (overallTotals.totalScore / overallTotals.totalMax) * 100 : null;
  const overallG = gesGradeFromPercentage(overallPct ?? undefined);

  return noStore(200, {
    ok: true,
    student: {
      id: student.id,
      firstName: student.firstName ?? null,
      lastName: student.lastName ?? null,
      fullName: `${student.firstName ?? ""} ${student.lastName ?? ""}`.trim() || "Learner",
      guardianName: student.guardianName ?? null,
      guardianPhone: student.guardianPhone ?? null,
    },
    classroom: access.classroom,
    termSummary: {
      overallPercentage: overallPct,
      grade: overallG?.grade ?? null,
      remark: overallG?.remark ?? null,
    },
    subjects,
  });
}