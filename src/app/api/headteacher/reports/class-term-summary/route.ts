// src/app/api/headteacher/reports/class-term-summary/route.ts
import { NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { buildClassPolicyReportTruth } from "@/lib/assessments/reportTruth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * GET /api/headteacher/reports/class-term-summary
 *
 * Query params:
 *  - classroomId (required)
 *  - term (required)
 *  - academicYear (required)
 */
export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "SCHOOL_ADMIN", "ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;

  try {
    const url = new URL(req.url);
    const classroomId = (url.searchParams.get("classroomId") ?? "").trim();
    const term = (url.searchParams.get("term") ?? "").trim();
    const academicYear = (url.searchParams.get("academicYear") ?? "").trim();

    if (!classroomId || !term || !academicYear) {
      return noStoreJson(400, {
        ok: false,
        error: "classroomId, term and academicYear are required query parameters.",
      });
    }

    const truth = await buildClassPolicyReportTruth({
      tenantId: ctx.tenantId,
      classroomId,
      term,
      academicYear,
    });

    if (!truth.ok) {
      return noStoreJson(truth.error === "CLASSROOM_NOT_FOUND" ? 404 : 400, {
        ok: false,
        error: truth.error,
      });
    }

    const subjects = truth.broadsheets.map((sheet) => sheet.subject);

    const studentRows = truth.students.map((student) => {
      const scoresBySubject: Record<string, number | null> = {};
      const percentageBySubject: Record<string, number | null> = {};
      const gradeBySubject: Record<string, string | null> = {};
      const positionBySubject: Record<string, number | null> = {};

      for (const sheet of truth.broadsheets) {
        const row = sheet.rows.find((r) => r.studentId === student.id) ?? null;
        scoresBySubject[sheet.subject] = row?.weightedTotal ?? null;
        percentageBySubject[sheet.subject] = row?.totalPercent ?? null;
        gradeBySubject[sheet.subject] = row?.grade ?? null;
        positionBySubject[sheet.subject] = row?.position ?? null;
      }

      const completePercentages = Object.values(percentageBySubject).filter(
        (p): p is number => typeof p === "number" && Number.isFinite(p)
      );

      const overallPercentage =
        completePercentages.length > 0
          ? Math.round(
              (completePercentages.reduce((sum, p) => sum + p, 0) /
                completePercentages.length) *
                100
            ) / 100
          : null;

      return {
        id: student.id,
        firstName: student.firstName ?? "",
        lastName: student.lastName ?? "",
        totalScore: overallPercentage ?? 0,
        maxTotalScore: completePercentages.length ? 100 : 0,
        overallPercentage,
        scoresBySubject,
        percentageBySubject,
        gradeBySubject,
        positionBySubject,
      };
    });

    return noStoreJson(200, {
      ok: true,
      tenantId: ctx.tenantId,
      classroomId,
      classroom: truth.classroom,
      term,
      academicYear,
      policy: truth.policy,
      readiness: truth.readiness,
      subjects,
      students: studentRows,
      broadsheets: truth.broadsheets,
      message:
        truth.students.length === 0
          ? "No learners found for this class. Please assign learners to this classroom first."
          : truth.broadsheets.length === 0
            ? "No assessment items found for this class and term yet. Once assessments are recorded, this report will populate."
            : undefined,
    });
  } catch (err: any) {
    console.error("[HEADTEACHER_CLASS_TERM_SUMMARY_GET]", err);
    return noStoreJson(500, {
      ok: false,
      error:
        err?.message || "Unexpected error while building class term summary.",
    });
  }
}