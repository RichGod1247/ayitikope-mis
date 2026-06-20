// src/app/api/teacher/assessment/remark-summary/route.ts
import { NextResponse } from "next/server";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  isAdminLikeRole,
  resolveUserClassroomAccess,
} from "@/lib/teacherAccess";
import { buildClassPolicyReportTruth } from "@/lib/assessments/reportTruth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

function emptyBands(gradeScale: GradeScaleRow[]) {
  return gradeScale.map((row) => ({
    grade: String(row.grade),
    label: row.label ?? row.remark ?? String(row.grade),
    remark: row.remark ?? row.label ?? null,
    minPercent: Number(row.minPercent),
    maxPercent: Number(row.maxPercent),
    learnersCount: 0,
  }));
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
      error: isForbiddenReason(access.reason)
        ? access.reason
        : "CLASSROOM_NOT_FOUND",
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

  const gradeScale = truth.policy.gradeScale as GradeScaleRow[];

  const visibleSheets = truth.broadsheets.filter((sheet) =>
    canSeeSubject({
      roleName: ctx.roleName,
      allowedSubjects: access.allowedSubjects,
      subject: sheet.subject,
    })
  );

  if (visibleSheets.length === 0) {
    return noStore(200, {
      ok: true,
      totalLearnersEvaluated: 0,
      policy: truth.policy,
      readiness: {
        status: "BLOCKED",
        subjectCount: 0,
        blockedSubjectCount: 0,
        learnerCount: truth.students.length,
        score: 0,
        blockedReasons: [
          "No policy-aware reportable subjects are visible for this teacher.",
        ],
      },
      bands: emptyBands(gradeScale),
    });
  }

  const scoresByStudent = new Map<string, number[]>();

  for (const sheet of visibleSheets) {
    for (const row of sheet.rows) {
      const pct = row.totalPercent;

      if (typeof pct !== "number" || !Number.isFinite(pct)) continue;

      const existing = scoresByStudent.get(row.studentId) ?? [];
      existing.push(pct);
      scoresByStudent.set(row.studentId, existing);
    }
  }

  const counts = new Map<string, number>();
  for (const band of gradeScale) {
    counts.set(String(band.grade), 0);
  }

  let evaluated = 0;

  for (const [, percentages] of scoresByStudent.entries()) {
    if (percentages.length === 0) continue;

    const avg =
      percentages.reduce((sum, pct) => sum + pct, 0) / percentages.length;

    const band = gradeFromPolicyScale(gradeScale, avg);

    if (!band) continue;

    evaluated += 1;
    const key = String(band.grade);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const blockedSubjects = visibleSheets.filter(
    (sheet) => sheet.readiness.status === "BLOCKED"
  );

  const bands = gradeScale.map((row) => ({
    grade: String(row.grade),
    label: row.label ?? row.remark ?? String(row.grade),
    remark: row.remark ?? row.label ?? null,
    minPercent: Number(row.minPercent),
    maxPercent: Number(row.maxPercent),
    learnersCount: counts.get(String(row.grade)) ?? 0,
  }));

  return noStore(200, {
    ok: true,
    totalLearnersEvaluated: evaluated,
    policy: truth.policy,
    readiness: {
      status: blockedSubjects.length ? "BLOCKED" : "READY",
      subjectCount: visibleSheets.length,
      blockedSubjectCount: blockedSubjects.length,
      learnerCount: truth.students.length,
      score:
        visibleSheets.length > 0
          ? Math.round(
              visibleSheets.reduce(
                (sum, sheet) => sum + Number(sheet.readiness.score ?? 0),
                0
              ) / visibleSheets.length
            )
          : 0,
      blockedReasons: blockedSubjects.flatMap((sheet) =>
        sheet.readiness.blockedReasons.map(
          (reason) => `${sheet.subject}: ${reason}`
        )
      ),
    },
    bands,
  });
}