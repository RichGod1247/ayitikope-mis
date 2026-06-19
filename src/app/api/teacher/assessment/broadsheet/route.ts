//src/app/api/teacher/assessment/broadsheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  isAdminLikeRole,
  resolveUserClassroomAccess,
  subjectEquals,
} from "@/lib/teacherAccess";
import { getTenantAssessmentPolicyLite } from "@/lib/assessments/policy";
import { buildSubjectBroadsheet } from "@/lib/assessments/broadsheet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(status: number, payload: unknown) {
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

function uniqueSorted(xs: string[]) {
  return Array.from(new Set(xs.map(clean).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}

function buildSubjectWhere(args: {
  roleName: string | null;
  allowedSubjects: string[] | null;
  requestedSubject: string | null;
}) {
  if (args.requestedSubject) {
    return {
      subject: {
        equals: args.requestedSubject,
        mode: "insensitive" as const,
      },
    };
  }

  if (isAdminLikeRole(args.roleName)) return {};

  if (args.allowedSubjects?.length) {
    return {
      OR: args.allowedSubjects.map((s) => ({
        subject: {
          equals: s,
          mode: "insensitive" as const,
        },
      })),
    };
  }

  return {
    id: "__NO_ACCESS__",
  };
}

export async function GET(req: NextRequest) {
  try {
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

    const url = new URL(req.url);
    const classroomId = clean(url.searchParams.get("classroomId"));
    const subjectParam = clean(url.searchParams.get("subject"));
    const term = clean(url.searchParams.get("term")) || "1st Term";
    const academicYear =
      clean(url.searchParams.get("academicYear")) || "2025/2026";

    if (!classroomId) {
      return jsonNoStore(400, {
        ok: false,
        error: "classroomId is required.",
      });
    }

    const access = await resolveUserClassroomAccess({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      roleName: ctx.roleName,
      classroomId,
      subject: subjectParam || null,
    });

    if (!access.ok) {
      return jsonNoStore(isForbiddenReason(access.reason) ? 403 : 404, {
        ok: false,
        error: access.reason,
      });
    }

    const students = await prisma.student.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        sex: true,
        gender: true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
    });

    const policy = await getTenantAssessmentPolicyLite(ctx.tenantId, {
      classroom: access.classroom,
    });

    const subjectWhere = buildSubjectWhere({
      roleName: ctx.roleName,
      allowedSubjects: access.allowedSubjects,
      requestedSubject: subjectParam || null,
    });

    const items = await prisma.assessmentItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId,
        term,
        academicYear,
        ...subjectWhere,
      },
      select: {
        id: true,
        subject: true,
        title: true,
        type: true,
        maxScore: true,
        weighting: true,
        status: true,
        componentCode: true,
        policyComponentId: true,
        sortOrder: true,
        isRequired: true,
      },
      orderBy: [
        { subject: "asc" },
        { sortOrder: "asc" },
        { title: "asc" },
        { createdAt: "asc" },
      ],
    });

    const itemIds = items.map((item) => item.id);

    const scores = itemIds.length
      ? await prisma.assessmentScore.findMany({
          where: {
            itemId: { in: itemIds },
            studentId: { in: students.map((s) => s.id) },
          },
          select: {
            itemId: true,
            studentId: true,
            score: true,
            comment: true,
          },
        })
      : [];

    const subjectsFromItems = uniqueSorted(items.map((item) => item.subject));

    const subjects =
      subjectParam && subjectParam.length > 0
        ? [subjectParam]
        : access.allowedSubjects?.length
          ? uniqueSorted([
              ...access.allowedSubjects,
              ...subjectsFromItems.filter((s) =>
                access.allowedSubjects?.some((allowed) => subjectEquals(allowed, s))
              ),
            ])
          : subjectsFromItems;

    const broadsheets = subjects.map((subject) =>
      buildSubjectBroadsheet({
        policy,
        subject,
        students,
        items,
        scores: scores.map((score) => ({
          itemId: score.itemId,
          studentId: score.studentId,
          score: Number(score.score ?? 0),
          comment: score.comment ?? null,
        })),
      })
    );

    const blockedSubjects = broadsheets.filter(
      (sheet) => sheet.readiness.status === "BLOCKED"
    );

    const overallReadiness = {
      status: blockedSubjects.length ? "BLOCKED" : "READY",
      subjectCount: broadsheets.length,
      blockedSubjectCount: blockedSubjects.length,
      learnerCount: students.length,
      score:
        broadsheets.length > 0
          ? Math.round(
              broadsheets.reduce((sum, sheet) => sum + sheet.readiness.score, 0) /
                broadsheets.length
            )
          : 0,
      blockedReasons: blockedSubjects.flatMap((sheet) =>
        sheet.readiness.blockedReasons.map(
          (reason) => `${sheet.subject}: ${reason}`
        )
      ),
    };

    return jsonNoStore(200, {
      ok: true,
      tenantId: ctx.tenantId,
      classroom: access.classroom,
      access: {
        scopeSource: access.scopeSource,
        allowedSubjects: access.allowedSubjects,
      },
      term,
      academicYear,
      policy: {
        id: policy.id,
        name: policy.name,
        levelBand: policy.levelBand,
        gradeScale: policy.gradeScale,
        components: policy.components,
      },
      students: students.map((s) => ({
        id: s.id,
        firstName: s.firstName ?? "",
        lastName: s.lastName ?? "",
        sex: s.sex ?? s.gender ?? "",
      })),
      broadsheets,
      readiness: overallReadiness,
    });
  } catch (err) {
    console.error("[TEACHER_ASSESSMENT_BROADSHEET_ERROR]", err);

    return jsonNoStore(500, {
      ok: false,
      error: "FAILED_TO_BUILD_BROADSHEET",
    });
  }
}