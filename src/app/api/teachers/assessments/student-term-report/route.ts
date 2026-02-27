import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, init?: Parameters<typeof NextResponse.json>[1]) {
  return NextResponse.json(payload, {
    ...init,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init?.headers ?? {}),
    },
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

/**
 * GET /api/teachers/assessments/student-term-report?studentId=...&term=...&academicYear=...
 */
export async function GET(req: NextRequest) {
  const gate = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["SUPERADMIN", "SCHOOL_ADMIN", "HEADTEACHER", "TEACHER"],
  });
  if (!gate.ok) return gate.res;
  const ctx = gate.ctx;

  const { searchParams } = new URL(req.url);
  const studentId = (searchParams.get("studentId") ?? "").trim();
  const term = (searchParams.get("term") ?? "").trim();
  const academicYear = (searchParams.get("academicYear") ?? "").trim();

  if (!studentId || !term || !academicYear) {
    return jsonNoStore({ ok: false, error: "studentId, term and academicYear are required." }, { status: 400 });
  }

  const student = await prisma.student.findFirst({
    where: { id: studentId, tenantId: ctx.tenantId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianName: true,
      guardianPhone: true,
      classroomId: true,
      classroom: { select: { id: true, name: true, grade: true, arm: true } },
    },
  });

  if (!student || !student.classroomId) {
    return jsonNoStore({ ok: false, error: "Student not found." }, { status: 404 });
  }

  const items = await prisma.assessmentItem.findMany({
    where: { tenantId: ctx.tenantId, classroomId: student.classroomId, term, academicYear },
    select: {
      id: true,
      subject: true,
      maxScore: true,
      scores: { where: { studentId }, select: { score: true } },
    },
  });

  const map = new Map<string, { subject: string; totalScore: number; totalMax: number; itemCount: number }>();

  for (const it of items) {
    const key = (it.subject ?? "").trim() || "Unknown";
    const cur = map.get(key) ?? { subject: key, totalScore: 0, totalMax: 0, itemCount: 0 };
    cur.itemCount += 1;
    cur.totalMax += Number(it.maxScore) || 0;
    const score = Number(it.scores?.[0]?.score ?? 0) || 0;
    cur.totalScore += score;
    map.set(key, cur);
  }

  const subjects = Array.from(map.values())
    .sort((a, b) => a.subject.localeCompare(b.subject))
    .map((s) => {
      const pct = s.totalMax > 0 ? (s.totalScore / s.totalMax) * 100 : null;
      const ges = gesFromPct(pct);
      return {
        subject: s.subject,
        totalScore: s.totalScore,
        maxScore: s.totalMax,
        percentage: pct,
        grade: ges?.grade ?? 9,
        remark: ges?.remark ?? "Lowest / Fail",
        itemCount: s.itemCount,
      };
    });

  const overall = subjects.reduce(
    (acc, s) => ({ totalScore: acc.totalScore + s.totalScore, totalMax: acc.totalMax + s.maxScore }),
    { totalScore: 0, totalMax: 0 }
  );

  const overallPct = overall.totalMax > 0 ? (overall.totalScore / overall.totalMax) * 100 : null;
  const overallGes = gesFromPct(overallPct);

  const fullName = `${student.firstName} ${student.lastName}`.trim();

  return jsonNoStore(
    {
      ok: true,
      context: { studentId, term, academicYear },
      student: {
        id: student.id,
        firstName: student.firstName,
        lastName: student.lastName,
        fullName,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
      },
      classroom: student.classroom
        ? { id: student.classroom.id, name: student.classroom.name, grade: student.classroom.grade, arm: student.classroom.arm }
        : null,
      subjects,
      termSummary: {
        overallPercentage: overallPct,
        grade: overallGes?.grade ?? 9,
        remark: overallGes?.remark ?? "Lowest / Fail",
      },
    },
    { status: 200 }
  );
}

export async function POST() {
  return jsonNoStore({ ok: false, error: "Method not allowed. Use GET." }, { status: 405 });
}