// src/app/api/headteacher/reports/student-term-report/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { normRole } from "@/lib/roleRouting";
import { buildStudentPolicyReportTruth } from "@/lib/assessments/reportTruth";

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
  return (
    r === "HEADTEACHER" ||
    r === "ADMIN" ||
    r === "SCHOOL_ADMIN" ||
    r === "SUPERADMIN"
  );
}

export async function GET(req: NextRequest) {
  try {
    const gate = await requireApiUserContext(req, { requireTenant: true });
    if (!gate.ok) return gate.res;

    const ctx = gate.ctx;

    if (!isHeadteacherOrAdmin(ctx.roleName)) {
      return jsonNoStore(
        {
          ok: false,
          error: "FORBIDDEN",
          role: ctx.roleName,
          path: "/api/headteacher/reports/student-term-report",
        },
        403
      );
    }

    const url = new URL(req.url);
    const studentId = String(url.searchParams.get("studentId") ?? "").trim();
    const term = String(url.searchParams.get("term") ?? "").trim();
    const academicYear = String(url.searchParams.get("academicYear") ?? "").trim();

    if (!studentId || !term || !academicYear) {
      return jsonNoStore(
        {
          ok: false,
          error: "studentId, term and academicYear are required query parameters.",
        },
        400
      );
    }

    const truth = await buildStudentPolicyReportTruth({
      tenantId: ctx.tenantId,
      studentId,
      term,
      academicYear,
    });

    if (!truth.ok) {
      if (truth.error === "STUDENT_NOT_FOUND") {
        return jsonNoStore(
          {
            ok: false,
            error:
              "Learner not found for this school. Please check the link or contact the office.",
          },
          404
        );
      }

      if (truth.error === "STUDENT_HAS_NO_CLASSROOM") {
  const student = "student" in truth ? truth.student : null;

  if (!student) {
    return jsonNoStore(
      {
        ok: false,
        error: "STUDENT_HAS_NO_CLASSROOM",
      },
      409
    );
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
        classroomId: student.classroomId ?? null,
      },
      classroom: student.classroom ?? null,
      term,
      academicYear,
      policy: null,
      classReadiness: null,
      subjects: [],
      overall: {
        totalScore: 0,
        maxTotalScore: 0,
        percentage: null as number | null,
      },
      message:
        "This learner is not assigned to a classroom yet. Please assign a class before generating term reports.",
    },
    200
  );
}

      return jsonNoStore(
        {
          ok: false,
          error: truth.error,
        },
        409
      );
    }

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

    const subjects = truth.subjects.map((subject) => ({
      subject: subject.subject,
      totalScore: subject.totalScore,
      maxTotalScore: subject.maxScore,
      maxScore: subject.maxScore,
      rawTotal: subject.rawTotal,
      rawMaxTotal: subject.rawMaxTotal,
      percentage: subject.percentage,
      grade: subject.grade,
      gradeLabel: subject.gradeLabel,
      remark: subject.remark,
      position: subject.position,
      complete: subject.complete,
      missingRequiredCount: subject.missingRequiredCount,
      missingOptionalCount: subject.missingOptionalCount,
      cells: subject.cells,
      readiness: subject.readiness,
    }));

    const hasAnyPercentage = subjects.some(
      (s) => typeof s.percentage === "number" && Number.isFinite(s.percentage)
    );

    return jsonNoStore(
      {
        ok: true,
        tenantId: ctx.tenantId,
        student: {
          id: truth.student.id,
          firstName: truth.student.firstName ?? "",
          lastName: truth.student.lastName ?? "",
          sex: truth.student.sex ?? truth.student.gender ?? "",
          classroomId: truth.student.classroomId,
        },
        classroom: truth.classroom,
        term,
        academicYear,
        policy: truth.policy,
        classReadiness: truth.classReadiness,
        subjects,
        overall: {
          totalScore: hasAnyPercentage ? truth.overallPercentage ?? 0 : 0,
          maxTotalScore: hasAnyPercentage ? 100 : 0,
          percentage: truth.overallPercentage,
        },
        headteacherSignature,
        message:
          truth.subjects.length === 0
            ? "No reportable assessment subjects found yet for this learner's class and term. Once assessment items are created and scored, this report will populate."
            : undefined,
      },
      200
    );
  } catch (err: any) {
    console.error("Error in /api/headteacher/reports/student-term-report", err);

    return jsonNoStore(
      {
        ok: false,
        error:
          err?.message || "Unexpected error while building learner term report.",
      },
      500
    );
  }
}