// src/app/api/headteacher/reports/student-term-report/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { normRole } from "@/lib/roleRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: unknown, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isHeadteacherOrAdmin(roleName: string | null) {
  const r = normRole(roleName ?? "");
  return r === "HEADTEACHER" || r === "ADMIN" || r === "SCHOOL_ADMIN" || r === "SUPERADMIN";
}

/**
 * GET /api/headteacher/reports/student-term-report
 * Query:
 *  - studentId (required)
 *  - term (required) e.g. "1st Term"
 *  - academicYear (required) e.g. "2025/2026"
 *
 * Security:
 *  - tenant derived from session only
 *  - role must be HEADTEACHER/ADMIN-like
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireApiUserContext(req, { requireTenant: true });
    if (!gate.ok) return gate.res;
    const ctx = gate.ctx;

    if (!isHeadteacherOrAdmin(ctx.roleName)) {
      return jsonNoStore(
        { ok: false, error: "FORBIDDEN", role: ctx.roleName, path: "/api/headteacher/reports/student-term-report" },
        403
      );
    }

    const url = new URL(req.url);
    const studentId = String(url.searchParams.get("studentId") ?? "").trim();
    const term = String(url.searchParams.get("term") ?? "").trim();
    const academicYear = String(url.searchParams.get("academicYear") ?? "").trim();

    if (!studentId || !term || !academicYear) {
      return jsonNoStore(
        { ok: false, error: "studentId, term and academicYear are required query parameters." },
        400
      );
    }

    // 1) Student must belong to the session tenant (facts only)
    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId: ctx.tenantId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        gender: true,
        classroomId: true,
      },
    });

    if (!student) {
      return jsonNoStore(
        {
          ok: false,
          error: "Learner not found for this school. Please check the link or contact the office.",
        },
        404
      );
    }

    if (!student.classroomId) {
      return jsonNoStore(
        {
          ok: true,
          tenantId: ctx.tenantId,
          student: {
            id: student.id,
            firstName: student.firstName ?? "",
            lastName: student.lastName ?? "",
            sex: student.sex ?? student.gender ?? "",
          },
          term,
          academicYear,
          subjects: [],
          overall: { totalScore: 0, maxTotalScore: 0, percentage: null as number | null },
          message: "This learner is not assigned to a classroom yet. Please assign a class before generating term reports.",
        },
        200
      );
    }

    const classroomId = student.classroomId;

    // 2) Items are tenant+class+term+year scoped by schema facts (AssessmentItem_filters_idx exists)
    const items = await prisma.assessmentItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId,
        term,
        academicYear,
      },
      select: { id: true, subject: true, title: true, maxScore: true },
      orderBy: [{ subject: "asc" }, { title: "asc" }],
    });

    if (items.length === 0) {
      return jsonNoStore(
        {
          ok: true,
          tenantId: ctx.tenantId,
          student: {
            id: student.id,
            firstName: student.firstName ?? "",
            lastName: student.lastName ?? "",
            sex: student.sex ?? student.gender ?? "",
          },
          term,
          academicYear,
          subjects: [],
          overall: { totalScore: 0, maxTotalScore: 0, percentage: null as number | null },
          message:
            "No assessment items found yet for this learner's class and term. Once assessments are recorded, this report will populate.",
        },
        200
      );
    }

    const itemIds = items.map((i) => i.id);

    // 3) Scores are scoped by studentId + itemIds; items already tenant-filtered
    const scores = await prisma.assessmentScore.findMany({
      where: { studentId, itemId: { in: itemIds } },
      select: { itemId: true, score: true, comment: true },
    });

    const scoreByItem = new Map<string, { score: number; comment: string | null }>();
    for (const sc of scores) {
      scoreByItem.set(sc.itemId, { score: Number(sc.score ?? 0), comment: sc.comment ?? null });
    }

    type SubjectRow = {
      subject: string;
      totalScore: number;
      maxTotalScore: number;
      percentage: number | null; // ratio 0..1
      items: { id: string; title: string; maxScore: number; score: number; comment: string | null }[];
    };

    const subjectsMap = new Map<string, SubjectRow>();
    const ensure = (subject: string): SubjectRow => {
      const key = subject || "Unknown";
      const existing = subjectsMap.get(key);
      if (existing) return existing;
      const created: SubjectRow = { subject: key, totalScore: 0, maxTotalScore: 0, percentage: null, items: [] };
      subjectsMap.set(key, created);
      return created;
    };

    for (const item of items) {
      const subject = item.subject ?? "Unknown";
      const maxScore = Number(item.maxScore ?? 0);
      const s = ensure(subject);

      const sc = scoreByItem.get(item.id);
      const score = Number(sc?.score ?? 0);

      s.totalScore += score;
      s.maxTotalScore += maxScore;
      s.items.push({
        id: item.id,
        title: item.title ?? "",
        maxScore,
        score,
        comment: sc?.comment ?? null,
      });
    }

    let overallTotal = 0;
    let overallMax = 0;
    for (const row of subjectsMap.values()) {
      overallTotal += row.totalScore;
      overallMax += row.maxTotalScore;
      row.percentage = row.maxTotalScore > 0 ? row.totalScore / row.maxTotalScore : null;
    }

    const subjects = Array.from(subjectsMap.values()).sort((a, b) => a.subject.localeCompare(b.subject));
    const overallPercentage = overallMax > 0 ? overallTotal / overallMax : null;

    let headteacherSignature: string | null = null;
    try {
      const sig = await prisma.headteacherSignature.findFirst({
        where: { tenantId: ctx.tenantId },
        select: { signatureSvg: true },
        orderBy: { updatedAt: "desc" },
      });
      headteacherSignature = sig?.signatureSvg ?? null;
    } catch {
      // non-fatal — signature is optional
    }

    return jsonNoStore(
      {
        ok: true,
        tenantId: ctx.tenantId,
        student: {
          id: student.id,
          firstName: student.firstName ?? "",
          lastName: student.lastName ?? "",
          sex: student.sex ?? student.gender ?? "",
          classroomId,
        },
        term,
        academicYear,
        subjects,
        overall: { totalScore: overallTotal, maxTotalScore: overallMax, percentage: overallPercentage },
        headteacherSignature,
      },
      200
    );
  } catch (err: any) {
    console.error("Error in /api/headteacher/reports/student-term-report", err);
    return jsonNoStore({ ok: false, error: err?.message || "Unexpected error while building learner term report." }, 500);
  }
}
