// src/app/api/teacher/assessment/term-summary/route.ts
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

  const items = await prisma.assessmentItem.findMany({
    where: { tenantId: ctx.tenantId, classroomId, term, academicYear, ...subjectWhere } as any,
    select: { id: true, subject: true, maxScore: true },
  });

  const bySubject = new Map<string, { itemCount: number; totalScore: number; totalMax: number }>();
  for (const it of items) {
    const key = it.subject || "—";
    const prev = bySubject.get(key) ?? { itemCount: 0, totalScore: 0, totalMax: 0 };
    prev.itemCount += 1;
    bySubject.set(key, prev);
  }

  const itemMax = new Map<string, number>();
  const itemIds: string[] = [];
  for (const it of items) {
    itemIds.push(it.id);
    itemMax.set(it.id, Number(it.maxScore ?? 0));
  }

  const scores = itemIds.length
    ? await prisma.assessmentScore.findMany({
        where: { itemId: { in: itemIds } },
        select: { itemId: true, score: true },
      })
    : [];

  for (const s of scores) {
    const max = itemMax.get(s.itemId) ?? 0;
    if (max <= 0) continue;

    const subject = items.find((x) => x.id === s.itemId)?.subject || "—";
    const agg = bySubject.get(subject) ?? { itemCount: 0, totalScore: 0, totalMax: 0 };
    agg.totalScore += Number(s.score ?? 0);
    agg.totalMax += max;
    bySubject.set(subject, agg);
  }

  const subjects = Array.from(bySubject.entries())
    .map(([subject, agg]) => {
      const avgPct = agg.totalMax > 0 ? (agg.totalScore / agg.totalMax) * 100 : null;
      const g = gesGradeFromPercentage(avgPct ?? undefined);
      return {
        subject,
        itemCount: agg.itemCount,
        averagePercentage: avgPct,
        grade: g?.grade ?? null,
        remark: g?.remark ?? null,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const overall = (() => {
    let totalScore = 0;
    let totalMax = 0;
    for (const [, agg] of bySubject.entries()) {
      totalScore += agg.totalScore;
      totalMax += agg.totalMax;
    }
    return totalMax > 0 ? (totalScore / totalMax) * 100 : null;
  })();

  return noStore(200, {
    ok: true,
    classroom: access.classroom,
    summary: {
      overallAveragePercentage: overall,
      subjects,
    },
  });
}