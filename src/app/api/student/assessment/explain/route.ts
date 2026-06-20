// src/app/api/student/assessment/explain/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import { buildStudentPolicyReportTruth } from "@/lib/assessments/reportTruth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function isAllowedRole(roleName: string | null) {
  const r = String(roleName ?? "").toUpperCase();
  return (
    r === "PARENT" ||
    r.includes("ADMIN") ||
    r.includes("HEAD") ||
    r.includes("SUPER") ||
    r.includes("OWNER")
  );
}

function round1(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(1))
    : null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiUserContext(req, { requireTenant: true });
    if (!auth.ok) return auth.res;

    const ctx = auth.ctx;

    if (!isAllowedRole(ctx.roleName)) {
      return noStoreJson({ ok: false, error: "FORBIDDEN" }, 403);
    }

    const { searchParams } = new URL(req.url);

    const studentId = (searchParams.get("studentId") || "").trim();
    const term = (searchParams.get("term") || "1st Term").trim();
    const academicYear = (
      searchParams.get("academicYear") || "2025/2026"
    ).trim();

    if (!studentId) {
      return noStoreJson({ ok: false, error: "studentId is required." }, 400);
    }

    const truth = await buildStudentPolicyReportTruth({
      tenantId: ctx.tenantId,
      studentId,
      term,
      academicYear,
    });

    if (!truth.ok) {
      if (truth.error === "STUDENT_NOT_FOUND") {
        return noStoreJson({ ok: false, error: "Student not found." }, 404);
      }

      if (truth.error === "STUDENT_HAS_NO_CLASSROOM") {
        return noStoreJson(
          {
            ok: true,
            studentId,
            term,
            academicYear,
            summary:
              "This learner is not assigned to a classroom yet, so EduLife OS cannot explain term performance truthfully.",
            suggestions:
              "First assign the learner to the correct class. After teachers create and enter assessment records, the explanation will become available.",
            meta: {
              overallPercentage: null,
              bestSubject: null,
              weakestSubject: null,
              subjectCount: 0,
              classReadiness: null,
            },
          },
          200
        );
      }

      return noStoreJson(
        {
          ok: false,
          error: "REPORT_TRUTH_UNAVAILABLE",
          detail: truth.error,
        },
        409
      );
    }

    const subjects = truth.subjects
      .map((subject) => ({
        subject: subject.subject,
        percentage: round1(subject.percentage),
        grade: subject.grade,
        gradeLabel: subject.gradeLabel,
        remark: subject.remark,
        complete: subject.complete,
        missingRequiredCount: subject.missingRequiredCount,
      }))
      .filter((subject) => subject.subject);

    const completeSubjects = subjects.filter(
      (subject) =>
        subject.percentage !== null &&
        typeof subject.percentage === "number" &&
        Number.isFinite(subject.percentage)
    );

    if (completeSubjects.length === 0) {
      const blockedReason =
        truth.classReadiness.blockedReasons?.[0] ??
        "No complete policy-aware subject result is available yet.";

      return noStoreJson(
        {
          ok: true,
          studentId,
          term,
          academicYear,
          summary:
            "For this term, there are no complete policy-aware assessment results to explain yet. This does not mean the learner is doing badly; it means the report is not ready for a truthful explanation.",
          suggestions:
            `Current blocker: ${blockedReason}\n\n` +
            "- Teachers should complete the required assessment items and scores.\n" +
            "- Once required score cells are complete, EduLife OS will explain strengths, weak areas, and next steps by subject.",
          meta: {
            overallPercentage: null,
            bestSubject: null,
            weakestSubject: null,
            subjectCount: subjects.length,
            classReadiness: truth.classReadiness,
          },
        },
        200
      );
    }

    const sorted = [...completeSubjects].sort(
      (a, b) => (b.percentage ?? 0) - (a.percentage ?? 0)
    );

    const bestSubject = sorted[0] ?? null;
    const weakestSubject = sorted[sorted.length - 1] ?? null;
    const overallPercentage = round1(truth.overallPercentage);

    const periodLabel = `${term}, ${academicYear}`;

    const lines: string[] = [];

    if (overallPercentage !== null) {
      lines.push(
        `For **${periodLabel}**, the learner's policy-aware assessment average is about **${overallPercentage}%**.`
      );
    } else {
      lines.push(
        `For **${periodLabel}**, EduLife OS has some subject evidence, but the overall average is not fully reliable yet.`
      );
    }

    if (bestSubject?.percentage !== null) {
      lines.push(
        `• Strongest subject: **${bestSubject.subject}** (~${bestSubject.percentage}%).`
      );
    }

    if (
      weakestSubject?.percentage !== null &&
      weakestSubject.subject !== bestSubject?.subject
    ) {
      lines.push(
        `• Needs most support: **${weakestSubject.subject}** (~${weakestSubject.percentage}%).`
      );
    }

    lines.push("", "These numbers are not identity. They are feedback.");

    const suggestions = [
      "Simple plan:",
      `- Protect the strongest subject (**${
        bestSubject?.subject ?? "the strongest area"
      }**) with weekly revision.`,
      `- For the weakest subject (**${
        weakestSubject?.subject ?? "the toughest area"
      }**): practise 2–3 questions daily and ask for help weekly.`,
      "- Improve by 5–10% next term: small daily consistency beats random big effort.",
    ].join("\n");

    return noStoreJson(
      {
        ok: true,
        studentId,
        term,
        academicYear,
        summary: lines.join("\n"),
        suggestions,
        meta: {
          overallPercentage,
          bestSubject: bestSubject
            ? {
                subject: bestSubject.subject,
                percentage: bestSubject.percentage,
                grade: bestSubject.grade,
                gradeLabel: bestSubject.gradeLabel,
                remark: bestSubject.remark,
              }
            : null,
          weakestSubject: weakestSubject
            ? {
                subject: weakestSubject.subject,
                percentage: weakestSubject.percentage,
                grade: weakestSubject.grade,
                gradeLabel: weakestSubject.gradeLabel,
                remark: weakestSubject.remark,
              }
            : null,
          subjectCount: subjects.length,
          completeSubjectCount: completeSubjects.length,
          classReadiness: truth.classReadiness,
        },
      },
      200
    );
  } catch (err: unknown) {
    console.error("[STUDENT_ASSESSMENT_EXPLAIN_ERROR]", err);

    return noStoreJson(
      {
        ok: false,
        error: "Failed to generate assessment explanation. Please try again.",
      },
      500
    );
  }
}