// src/app/api/teachers/assessment/term-dashboard/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: { "Cache-Control": "no-store", ...(init?.headers ?? {}) },
  });
}

function gesFromPct(pct: number | null) {
  if (pct == null || Number.isNaN(pct)) return null;
  if (pct >= 90 && pct <= 100) return { grade: 1, remark: "Excellent" };
  if (pct >= 80 && pct <= 89) return { grade: 2, remark: "Very Good" };
  if (pct >= 70 && pct <= 79) return { grade: 3, remark: "Good" };
  if (pct >= 60 && pct <= 69) return { grade: 4, remark: "High Average" };
  if (pct >= 55 && pct <= 59) return { grade: 5, remark: "Average" };
  if (pct >= 50 && pct <= 54) return { grade: 6, remark: "Low Average" };
  if (pct >= 40 && pct <= 49) return { grade: 7, remark: "Low Average" };
  if (pct >= 35 && pct <= 39) return { grade: 8, remark: "Lower" };
  if (pct >= 0 && pct <= 34) return { grade: 9, remark: "Lowest / Fail" };
  if (pct > 100) return { grade: 1, remark: "Excellent (scaled)" };
  return { grade: 9, remark: "Lowest / Fail" };
}

export async function GET(req: NextRequest) {
  const ctx = await requireServerUserContext({ requireTenant: true });

  const { searchParams } = new URL(req.url);
  const classroomId = (searchParams.get("classroomId") ?? "").trim();
  const term = (searchParams.get("term") ?? "").trim();
  const academicYear = (searchParams.get("academicYear") ?? "").trim();

  if (!classroomId || !term || !academicYear) {
    return jsonNoStore(
      { ok: false, error: "classroomId, term and academicYear are required." },
      { status: 400 }
    );
  }

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId: ctx.tenantId },
    select: { id: true, name: true, grade: true, arm: true },
  });

  if (!classroom) {
    return jsonNoStore({ ok: false, error: "Classroom not found." }, { status: 404 });
  }

  const learners = await prisma.student.findMany({
    where: { tenantId: ctx.tenantId, classroomId },
    select: { id: true, firstName: true, lastName: true, guardianPhone: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  const items = await prisma.assessmentItem.findMany({
    where: { tenantId: ctx.tenantId, classroomId, term, academicYear },
    select: { id: true, maxScore: true },
  });

  const itemIds = items.map((i) => i.id);
  const totalMaxAll = items.reduce((sum, i) => sum + i.maxScore, 0);

  const scores = itemIds.length
    ? await prisma.assessmentScore.findMany({
        where: { itemId: { in: itemIds } },
        select: { itemId: true, studentId: true, score: true },
      })
    : [];

  const scoreMap = new Map<string, number>(); // `${studentId}__${itemId}` -> score
  for (const s of scores) scoreMap.set(`${s.studentId}__${s.itemId}`, s.score);

  const rows = learners.map((l) => {
    let totalScore = 0;
    for (const it of items) {
      totalScore += scoreMap.get(`${l.id}__${it.id}`) ?? 0;
    }
    const pct = totalMaxAll > 0 ? (totalScore / totalMaxAll) * 100 : null;
    const ges = gesFromPct(pct);

    return {
      studentId: l.id,
      fullName: `${l.firstName} ${l.lastName}`.trim(),
      guardianPhone: l.guardianPhone ?? null,
      itemsCount: items.length,
      totalScore,
      totalMax: totalMaxAll,
      percentage: pct,
      grade: ges?.grade ?? 9,
      remark: ges?.remark ?? "Lowest / Fail",
    };
  });

  const classTotalScore = rows.reduce((sum, r) => sum + r.totalScore, 0);
  const classTotalMax = rows.reduce((sum, r) => sum + r.totalMax, 0);
  const classPct = classTotalMax > 0 ? (classTotalScore / classTotalMax) * 100 : null;
  const classGes = gesFromPct(classPct);

  return jsonNoStore(
    {
      ok: true,
      context: { classroomId, term, academicYear },
      classroom,
      learners: rows,
      classAverage: {
        totalScore: classTotalScore,
        totalMax: classTotalMax,
        percentage: classPct,
        grade: classGes?.grade ?? 9,
        remark: classGes?.remark ?? "Lowest / Fail",
      },
    },
    { status: 200 }
  );
}

export async function POST() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use GET." }, { status: 405 });
}
