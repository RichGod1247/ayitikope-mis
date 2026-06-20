// src/app/api/teacher/assessment/student-term-report/route.ts
import { NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  isAdminLikeRole,
  resolveUserClassroomAccess,
} from "@/lib/teacherAccess";
import { buildStudentPolicyReportTruth } from "@/lib/assessments/reportTruth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function isForbiddenReason(reason: string) {
  return reason === "OUT_OF_SCOPE" || reason === "SUBJECT_OUT_OF_SCOPE";
}

function canSeeSubject(args: {
  roleName: string | null;
  allowedSubjects: string[] | null;
  subject: string;
}) {
  if (isAdminLikeRole(args.roleName)) return true;
  if (!args.allowedSubjects?.length) return true;

  const target = clean(args.subject).toLowerCase();
  return args.allowedSubjects.some((s) => clean(s).toLowerCase() === target);
}

function round2(v: number | null | undefined) {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.round(v * 100) / 100
    : null;
}

export async function GET(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: [
      "TEACHER",
      "HEADTEACHER",
      "ADMIN",
      "SCHOOL_ADMIN",
      "SUPERADMIN",
    ],
  });

  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const studentId = clean(searchParams.get("studentId"));
  const term = clean(searchParams.get("term")) || "1st Term";
  const academicYear = clean(searchParams.get("academicYear")) || "2025/2026";

  if (!studentId) {
    return noStore(400, { ok: false, error: "STUDENT_ID_REQUIRED" });
  }

  const truth = await buildStudentPolicyReportTruth({
    tenantId: ctx.tenantId,
    studentId,
    term,
    academicYear,
  });

  if (!truth.ok) {
    if (truth.error === "STUDENT_NOT_FOUND") {
      return noStore(404, { ok: false, error: "STUDENT_NOT_FOUND" });
    }

    if (truth.error === "STUDENT_HAS_NO_CLASSROOM") {
      return noStore(400, {
        ok: false,
        error: "STUDENT_HAS_NO_CLASSROOM",
      });
    }

    return noStore(409, {
      ok: false,
      error: "REPORT_TRUTH_UNAVAILABLE",
      detail: truth.error,
    });
  }

  if (!truth.student.classroomId) {
    return noStore(400, { ok: false, error: "STUDENT_HAS_NO_CLASSROOM" });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId: truth.student.classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: access.reason,
    });
  }

  const visibleSubjects = truth.subjects.filter((subject) =>
    canSeeSubject({
      roleName: ctx.roleName,
      allowedSubjects: access.allowedSubjects,
      subject: subject.subject,
    })
  );

  const subjects = visibleSubjects.map((subject) => {
    const cells = Array.isArray(subject.cells) ? subject.cells : [];
    const recordedItemCount = cells.filter(
      (cell) => typeof (cell as { score?: unknown }).score === "number"
    ).length;

    return {
      subject: subject.subject,
      itemCount: cells.length,
      recordedItemCount,
      totalScore: subject.totalScore,
      maxScore: subject.maxScore,
      rawTotal: subject.rawTotal,
      rawMaxTotal: subject.rawMaxTotal,
      percentage: round2(subject.percentage),
      grade: subject.grade ?? null,
      remark: subject.remark ?? subject.gradeLabel ?? null,
      position: subject.position ?? null,
      complete: subject.complete,
      missingRequiredCount: subject.missingRequiredCount,
      missingOptionalCount: subject.missingOptionalCount,
      items: cells,
      cells,
      readiness: subject.readiness,
    };
  });

  const completePercentages = subjects
    .map((subject) => subject.percentage)
    .filter((p): p is number => typeof p === "number" && Number.isFinite(p));

  const overallPct =
    completePercentages.length > 0
      ? round2(
          completePercentages.reduce((sum, p) => sum + p, 0) /
            completePercentages.length
        )
      : null;

  const blockedSubjects = subjects.filter(
    (subject) => subject.readiness?.status === "BLOCKED"
  );

  const visibleReadiness = {
    status: blockedSubjects.length || subjects.length === 0 ? "BLOCKED" : "READY",
    subjectCount: subjects.length,
    blockedSubjectCount: blockedSubjects.length,
    learnerCount: 1,
    score:
      subjects.length > 0
        ? Math.round(
            subjects.reduce(
              (sum, subject) => sum + Number(subject.readiness?.score ?? 0),
              0
            ) / subjects.length
          )
        : 0,
    blockedReasons:
      subjects.length === 0
        ? ["No policy-aware reportable subjects are visible for this teacher."]
        : blockedSubjects.flatMap((subject) =>
            (subject.readiness?.blockedReasons ?? []).map(
              (reason: string) => `${subject.subject}: ${reason}`
            )
          ),
  };

  return noStore(200, {
    ok: true,
    student: {
      id: truth.student.id,
      firstName: truth.student.firstName ?? null,
      lastName: truth.student.lastName ?? null,
      fullName:
        `${truth.student.firstName ?? ""} ${truth.student.lastName ?? ""}`.trim() ||
        "Learner",
      guardianName: truth.student.guardianName ?? null,
      guardianPhone: truth.student.guardianPhone ?? null,
      classroomId: truth.student.classroomId,
    },
    classroom: access.classroom,
    access: {
      scopeSource: access.scopeSource,
      allowedSubjects: access.allowedSubjects,
    },
    term,
    academicYear,
    policy: truth.policy,
    classReadiness: visibleReadiness,
    termSummary: {
      overallPercentage: overallPct,
      grade: null,
      remark:
        overallPct === null
          ? "No complete policy-aware result available yet."
          : "Policy-aware teacher view.",
    },
    subjects,
  });
}