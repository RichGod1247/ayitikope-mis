//src/app/api/teacher/assessment/remark-summary/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { isAdminLikeRole, resolveUserClassroomAccess } from "@/lib/teacherAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function bandDefs() {
  return [
    { grade: 1, label: "Excellent", min: 90, max: 100 },
    { grade: 2, label: "Very Good", min: 80, max: 89 },
    { grade: 3, label: "Good", min: 70, max: 79 },
    { grade: 4, label: "High Average", min: 60, max: 69 },
    { grade: 5, label: "Average", min: 55, max: 59 },
    { grade: 6, label: "Low Average", min: 50, max: 54 },
    { grade: 7, label: "Low", min: 40, max: 49 },
    { grade: 8, label: "Lower", min: 35, max: 39 },
    { grade: 9, label: "Lowest / Fail", min: 0, max: 34 },
  ];
}

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

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

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
    const bands = bandDefs().map((b) => ({
      grade: b.grade,
      label: b.label,
      minPercent: b.min,
      maxPercent: b.max,
      learnersCount: 0,
    }));
    return noStore(200, { ok: true, totalLearnersEvaluated: 0, bands });
  }

  const itemMax = new Map<string, number>();
  const itemIds = items.map((i) => {
    itemMax.set(i.id, Number(i.maxScore ?? 0));
    return i.id;
  });

  const scores = await prisma.assessmentScore.findMany({
    where: { itemId: { in: itemIds } },
    select: { itemId: true, studentId: true, score: true },
  });

  const totals = new Map<string, { totalScore: number; totalMax: number }>();

  for (const s of scores) {
    const max = itemMax.get(s.itemId) ?? 0;
    if (max <= 0) continue;
    const prev = totals.get(s.studentId) || { totalScore: 0, totalMax: 0 };
    prev.totalScore += Number(s.score ?? 0);
    prev.totalMax += max;
    totals.set(s.studentId, prev);
  }

  const defs = bandDefs();
  const counts = new Map<number, number>();
  for (const d of defs) counts.set(d.grade, 0);

  let evaluated = 0;
  for (const [, t] of totals.entries()) {
    if (t.totalMax <= 0) continue;
    evaluated += 1;
    const pct = (t.totalScore / t.totalMax) * 100;
    const band = defs.find((b) => pct >= b.min && pct <= b.max) || (pct > 100 ? defs[0] : defs[defs.length - 1]);
    counts.set(band.grade, (counts.get(band.grade) ?? 0) + 1);
  }

  const bands = defs.map((b) => ({
    grade: b.grade,
    label: b.label,
    minPercent: b.min,
    maxPercent: b.max,
    learnersCount: counts.get(b.grade) ?? 0,
  }));

  return noStore(200, { ok: true, totalLearnersEvaluated: evaluated, bands });
}