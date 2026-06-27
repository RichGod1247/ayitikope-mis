// src/app/api/headteacher/student/detail/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import {
  calculatePlacementMockAggregate,
  calculateSchoolMockAggregate,
  canonicalMockSubject,
  cleanMockStr,
  mockGradeFromScore,
  readinessBandFromAggregate,
} from "@/lib/assessments/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonNoStore(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function isNextRedirectError(err: any) {
  return typeof err?.digest === "string" && err.digest.startsWith("NEXT_REDIRECT");
}

function toISODateOnly(input?: string | null): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normRole(name: any) {
  return String(name ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function looksLikeHeadOrAdmin(roleName: string) {
  if (!roleName) return false;
  if (roleName.includes("ADMIN")) return true;
  if (roleName.includes("HEAD")) return true;
  if (roleName === "HT") return true;
  if (roleName === "HEADTEACHER") return true;
  if (roleName === "SCHOOL_ADMIN") return true;
  return false;
}

async function requireHeadOrAdmin(tenantId: string, userId: string) {
  const m = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });
  if (!m) return { ok: false as const, status: 403, error: "FORBIDDEN" };
  const roleName = normRole(m.role?.name);
  return looksLikeHeadOrAdmin(roleName)
    ? ({ ok: true as const } as const)
    : ({ ok: false as const, status: 403, error: "FORBIDDEN" } as const);
}

type ItemStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "NO_MARK";

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function uniqueLabels(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    const label = cleanMockStr(value);
    if (!label) continue;

    const key = label.toUpperCase();
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(label);
  }

  return out;
}

function buildMockNextAction(args: {
  missingSubjects: string[];
  weakSubjects: Array<{ subject: string; score: number | null }>;
  nearGradeOpportunities: Array<{
    subject: string;
    pointsToNextGrade: number | null;
    nextGrade: number | null;
  }>;
}) {
  const firstMissing = args.missingSubjects[0] ?? null;
  const firstWeak = args.weakSubjects[0] ?? null;
  const firstNear = args.nearGradeOpportunities[0] ?? null;

  if (firstMissing) {
    return `Complete missing ${firstMissing} evidence first. Aggregate judgment is unreliable until this subject is captured.`;
  }

  if (firstWeak) {
    return `Prioritize remedial correction in ${firstWeak.subject}. Current score is ${firstWeak.score}.`;
  }

  if (firstNear) {
    return `Push ${firstNear.subject}. Only ${firstNear.pointsToNextGrade} mark(s) needed to reach Grade ${firstNear.nextGrade}.`;
  }

  return "Maintain monitoring, protect strong subjects, and prepare for the next Mock evidence cycle.";
}

async function buildStudentMockReadiness(args: {
  tenantId: string;
  studentId: string;
  classroomId: string;
}) {
  const session = await prisma.mockExamSession.findFirst({
    where: {
      tenantId: args.tenantId,
      classroomId: args.classroomId,
    },
    orderBy: [{ academicYear: "desc" }, { mockNumber: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      classroomId: true,
      academicYear: true,
      term: true,
      mockNumber: true,
      mockLabel: true,
      title: true,
      status: true,
      date: true,
      items: {
        where: {
          type: "MOCK",
        },
        select: {
          id: true,
          subject: true,
          title: true,
          maxScore: true,
          status: true,
          scores: {
            where: {
              studentId: args.studentId,
            },
            select: {
              score: true,
              comment: true,
            },
          },
        },
        orderBy: [{ subject: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!session) {
    return {
      available: false,
      reason: "No Mock session found for this learner's classroom yet.",
      session: null,
      averageScore: null,
      scoredSubjectCount: 0,
      missingSubjectCount: 0,
      schoolAggregate: null,
      placementAggregate: null,
      readiness: null,
      missingSubjects: [],
      weakSubjects: [],
      strongSubjects: [],
      nearGradeOpportunities: [],
      nextAction: "Create a JHS 3 Mock session and subject columns first.",
    };
  }

  const subjects = session.items.map((item) => {
    const scoreRow = item.scores[0] ?? null;
    const score = scoreRow?.score ?? null;
    const grade = score != null ? mockGradeFromScore(score) : null;

    return {
      itemId: item.id,
      subject: item.subject,
      canonicalSubject: canonicalMockSubject(item.subject),
      title: item.title,
      maxScore: item.maxScore,
      status: item.status,
      score,
      comment: scoreRow?.comment ?? null,
      grade: grade?.grade ?? null,
      gradeLabel: grade?.label ?? null,
      remark: grade?.remark ?? null,
      nextGrade: grade?.nextGrade ?? null,
      pointsToNextGrade: grade?.pointsToNextGrade ?? null,
    };
  });

  const scoredSubjects = subjects.filter((subject) => subject.score != null);

  const averageScore =
    scoredSubjects.length > 0
      ? round1(
          scoredSubjects.reduce((sum, subject) => sum + Number(subject.score ?? 0), 0) /
            scoredSubjects.length
        )
      : null;

  const aggregateInputs = subjects.map((subject) => ({
    subject: subject.subject,
    score: subject.score,
    grade: subject.grade,
  }));

  const schoolAggregate = calculateSchoolMockAggregate(aggregateInputs);
  const placementAggregate = calculatePlacementMockAggregate(aggregateInputs);

  const readiness = placementAggregate.ok
    ? readinessBandFromAggregate(placementAggregate.aggregate)
    : readinessBandFromAggregate(null);

  const missingSubjects = uniqueLabels([
    ...(schoolAggregate.missingSubjects ?? []),
    ...(placementAggregate.missingSubjects ?? []),
  ]);

  const weakSubjects = subjects
    .filter((subject) => typeof subject.score === "number" && subject.score < 50)
    .sort((a, b) => Number(a.score ?? 999) - Number(b.score ?? 999));

  const strongSubjects = subjects
    .filter((subject) => typeof subject.grade === "number" && subject.grade <= 3)
    .sort((a, b) => {
      if (Number(a.grade ?? 99) !== Number(b.grade ?? 99)) {
        return Number(a.grade ?? 99) - Number(b.grade ?? 99);
      }

      return Number(b.score ?? 0) - Number(a.score ?? 0);
    });

  const nearGradeOpportunities = subjects
    .filter(
      (subject) =>
        typeof subject.pointsToNextGrade === "number" &&
        subject.pointsToNextGrade > 0 &&
        subject.pointsToNextGrade <= 5
    )
    .sort(
      (a, b) =>
        Number(a.pointsToNextGrade ?? 999) - Number(b.pointsToNextGrade ?? 999)
    );

  return {
    available: true,
    reason: null,
    session: {
      id: session.id,
      classroomId: session.classroomId,
      academicYear: session.academicYear,
      term: session.term,
      mockNumber: session.mockNumber,
      mockLabel: session.mockLabel,
      title: session.title,
      status: session.status,
      date: session.date ? session.date.toISOString() : null,
    },
    averageScore,
    scoredSubjectCount: scoredSubjects.length,
    missingSubjectCount: Math.max(0, subjects.length - scoredSubjects.length),
    schoolAggregate,
    placementAggregate,
    readiness,
    missingSubjects,
    weakSubjects: weakSubjects.slice(0, 6),
    strongSubjects: strongSubjects.slice(0, 6),
    nearGradeOpportunities: nearGradeOpportunities.slice(0, 6),
    subjects,
    nextAction: buildMockNextAction({
      missingSubjects,
      weakSubjects,
      nearGradeOpportunities,
    }),
    cockpitHref: `/headteacher/assessment/mock?sessionId=${encodeURIComponent(session.id)}`,
  };
}

export async function GET(req: NextRequest) {
  let tenantId = "";
  let userId = "";
  try {
    const r: any = await requireServerUserContext({ requireTenant: true } as any);
    const ctx = r?.ctx ?? r;
    tenantId = String(ctx.tenantId ?? ctx.activeTenantId ?? "").trim();
    userId = String(ctx.userId ?? ctx.user?.id ?? "").trim();
  } catch (err: any) {
    if (isNextRedirectError(err)) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
    return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);
  }

  if (!tenantId || !userId) return jsonNoStore({ ok: false, error: "UNAUTHORIZED" }, 401);

  const roleOk = await requireHeadOrAdmin(tenantId, userId);
  if (!roleOk.ok) return jsonNoStore({ ok: false, error: roleOk.error }, roleOk.status);

  try {
    const { searchParams } = req.nextUrl;
    const studentId = String(searchParams.get("studentId") || "").trim();
    const start = toISODateOnly(searchParams.get("start"));
    const end = toISODateOnly(searchParams.get("end"));

    if (!studentId || !start || !end) return jsonNoStore({ ok: false, error: "studentId, start, end are required" }, 400);

    const student = await prisma.student.findFirst({
      where: { id: studentId, tenantId },
      select: { id: true, firstName: true, lastName: true, guardianName: true, guardianPhone: true, classroomId: true },
    });

    if (!student) return jsonNoStore({ ok: false, error: "Student not found for this tenant" }, 404);

    if (!student.classroomId) {
      return jsonNoStore(
        {
          ok: true,
          meta: {
            studentId,
            start,
            end,
            fullName: [student.firstName, student.lastName].filter(Boolean).join(" "),
            guardianName: student.guardianName ?? "",
            guardianPhone: student.guardianPhone ?? "",
            sessions: 0,
            present: 0,
            absent: 0,
            late: 0,
            excused: 0,
            noMark: 0,
            pctPresent: 0,
          },
          items: [],
mockReadiness: {
  available: false,
  reason: "This learner is not attached to a classroom.",
  session: null,
  averageScore: null,
  scoredSubjectCount: 0,
  missingSubjectCount: 0,
  schoolAggregate: null,
  placementAggregate: null,
  readiness: null,
  missingSubjects: [],
  weakSubjects: [],
  strongSubjects: [],
  nearGradeOpportunities: [],
  nextAction: "Attach the learner to a JHS 3 classroom before Mock readiness can be calculated.",
},
        },
        200
      );
    }

    const rows = await prisma.$queryRaw<Array<{ date: string; status: string | null; note: string | null }>>`
      SELECT
        s."date"::date::text AS "date",
        m."status"::text     AS "status",
        m."note"             AS "note"
      FROM "edulife_os"."AttendanceSession" s
      LEFT JOIN "edulife_os"."AttendanceMark" m
        ON m."sessionId" = s."id"
       AND m."studentId" = ${studentId}
      WHERE s."tenantId" = ${tenantId}
        AND s."classroomId" = ${student.classroomId}
        AND s."date"::date BETWEEN ${start}::date AND ${end}::date
      ORDER BY s."date"::date ASC
    `;

    const items = rows.map((r) => {
      const raw = (r.status ?? "").toUpperCase();
      const status: ItemStatus =
        raw === "PRESENT" || raw === "ABSENT" || raw === "LATE" || raw === "EXCUSED" ? (raw as ItemStatus) : "NO_MARK";
      return { date: r.date, status, note: r.note ?? "" };
    });

    const counts = {
      sessions: items.length,
      present: items.filter((i) => i.status === "PRESENT").length,
      absent: items.filter((i) => i.status === "ABSENT").length,
      late: items.filter((i) => i.status === "LATE").length,
      excused: items.filter((i) => i.status === "EXCUSED").length,
      noMark: items.filter((i) => i.status === "NO_MARK").length,
    };

const pctPresent = counts.sessions > 0 ? Math.round((counts.present / counts.sessions) * 100) : 0;

const mockReadiness = await buildStudentMockReadiness({
  tenantId,
  studentId,
  classroomId: student.classroomId,
});

return jsonNoStore(
      {
        ok: true,
        meta: {
          studentId,
          start,
          end,
          fullName: [student.firstName, student.lastName].filter(Boolean).join(" "),
          guardianName: student.guardianName ?? "",
          guardianPhone: student.guardianPhone ?? "",
          ...counts,
          pctPresent,
        },
        items,
mockReadiness,
      },
      200
    );
  } catch (err) {
    console.error("student/detail error:", err);
    return jsonNoStore({ ok: false, error: "FAILED_TO_LOAD_STUDENT_DETAIL" }, 500);
  }
}
