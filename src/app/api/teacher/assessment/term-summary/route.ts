// src/app/api/teacher/assessment/term-summary/route.ts
import { NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  isAdminLikeRole,
  resolveUserClassroomAccess,
} from "@/lib/teacherAccess";
import { buildClassPolicyReportTruth } from "@/lib/assessments/reportTruth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GradeScaleRow = {
  grade: string | number;
  minPercent: number;
  maxPercent: number;
  label?: string | null;
  remark?: string | null;
};

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

function gradeFromPolicyScale(
  gradeScale: GradeScaleRow[] | undefined,
  pct: number | null
) {
  if (pct === null || !Number.isFinite(pct)) return null;

  return (
    gradeScale?.find(
      (row) => pct >= Number(row.minPercent) && pct <= Number(row.maxPercent)
    ) ?? null
  );
}

function getSheetItemCount(sheet: {
  components: unknown[];
  rows: Array<{ cells?: unknown[] }>;
}) {
  const maxCellsFromRows = sheet.rows.reduce((max, row) => {
    const cells = Array.isArray(row.cells) ? row.cells : [];
    return Math.max(max, cells.length);
  }, 0);

  return Math.max(sheet.components.length, maxCellsFromRows);
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

  const classroomId = clean(searchParams.get("classroomId"));
  const term = clean(searchParams.get("term")) || "1st Term";
  const academicYear = clean(searchParams.get("academicYear")) || "2025/2026";

  if (!classroomId) {
    return noStore(400, { ok: false, error: "MISSING_CLASSROOM_ID" });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: access.reason,
    });
  }

  const truth = await buildClassPolicyReportTruth({
    tenantId: ctx.tenantId,
    classroomId,
    term,
    academicYear,
  });

  if (!truth.ok) {
    return noStore(truth.error === "CLASSROOM_NOT_FOUND" ? 404 : 409, {
      ok: false,
      error: truth.error,
    });
  }

  const visibleSheets = truth.broadsheets.filter((sheet) =>
    canSeeSubject({
      roleName: ctx.roleName,
      allowedSubjects: access.allowedSubjects,
      subject: sheet.subject,
    })
  );

  const subjects = visibleSheets
    .map((sheet) => {
      const percentages = sheet.rows
        .map((row) => row.totalPercent)
        .filter(
          (p): p is number => typeof p === "number" && Number.isFinite(p)
        );

      const averagePercentage =
        percentages.length > 0
          ? round2(
              percentages.reduce((sum, p) => sum + p, 0) / percentages.length
            )
          : null;

      const grade = gradeFromPolicyScale(
        truth.policy.gradeScale as GradeScaleRow[],
        averagePercentage
      );

      return {
        subject: sheet.subject,
        itemCount: getSheetItemCount(sheet),
        componentCount: sheet.components.length,
        learnerCount: sheet.rows.length,
        completeLearnerCount: sheet.rows.filter((row) => row.complete).length,
        averagePercentage,
        grade: grade ? String(grade.grade) : null,
        remark: grade?.remark ?? grade?.label ?? null,
        readiness: sheet.readiness,
      };
    })
    .sort((a, b) => a.subject.localeCompare(b.subject));

  const allPercentages = visibleSheets.flatMap((sheet) =>
    sheet.rows
      .map((row) => row.totalPercent)
      .filter((p): p is number => typeof p === "number" && Number.isFinite(p))
  );

  const overall =
    allPercentages.length > 0
      ? round2(
          allPercentages.reduce((sum, p) => sum + p, 0) /
            allPercentages.length
        )
      : null;

  const blockedSubjects = subjects.filter(
    (subject) => subject.readiness.status === "BLOCKED"
  );

  const readiness = {
    status: blockedSubjects.length || subjects.length === 0 ? "BLOCKED" : "READY",
    subjectCount: subjects.length,
    blockedSubjectCount: blockedSubjects.length,
    learnerCount: truth.students.length,
    score:
      subjects.length > 0
        ? Math.round(
            subjects.reduce(
              (sum, subject) => sum + Number(subject.readiness.score ?? 0),
              0
            ) / subjects.length
          )
        : 0,
    blockedReasons:
      subjects.length === 0
        ? ["No policy-aware reportable subjects are visible for this teacher."]
        : blockedSubjects.flatMap((subject) =>
            subject.readiness.blockedReasons.map(
              (reason) => `${subject.subject}: ${reason}`
            )
          ),
  };

  return noStore(200, {
    ok: true,
    classroom: access.classroom,
    access: {
      scopeSource: access.scopeSource,
      allowedSubjects: access.allowedSubjects,
    },
    term,
    academicYear,
    policy: truth.policy,
    readiness,
    summary: {
      overallAveragePercentage: overall,
      subjects,
    },
  });
}