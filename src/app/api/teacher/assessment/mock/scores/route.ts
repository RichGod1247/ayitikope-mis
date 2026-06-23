//src/app/api/teacher/assessment/mock/scores/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { resolveUserClassroomAccess } from "@/lib/teacherAccess";
import {
  cleanMockStr,
  isJhs3MockClassroom,
  mockGradeFromScore,
  MOCK_MAX_SCORE,
} from "@/lib/assessments/mock";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MockScoreInputSchema = z.object({
  studentId: z.string().min(1),
  score: z.unknown().optional().nullable(),
  comment: z.string().nullable().optional(),
});

const MockScoresUpsertSchema = z.object({
  itemId: z.string().min(1),
  scores: z.array(MockScoreInputSchema).max(500),
});

type MockItemForScores = {
  id: string;
  tenantId: string;
  classroomId: string;
  subject: string;
  term: string;
  academicYear: string;
  title: string;
  type: string;
  maxScore: number;
  status: string;
  lockedAt: Date | null;
  mockExamSessionId: string | null;
  mockExamSession: {
    id: string;
    tenantId: string;
    classroomId: string;
    academicYear: string;
    term: string | null;
    mockNumber: number;
    mockLabel: string;
    title: string;
    status: string;
    date: Date | null;
    classroom: {
      id: string;
      name: string | null;
      grade: string | null;
      arm: string | null;
    };
  } | null;
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

function isForbiddenReason(reason: string) {
  return reason === "OUT_OF_SCOPE" || reason === "SUBJECT_OUT_OF_SCOPE";
}

function studentName(s: { firstName: string | null; lastName: string | null }) {
  return `${s.firstName || ""} ${s.lastName || ""}`.trim() || "Learner";
}

function parseScore(raw: unknown):
  | { ok: true; value: number | null }
  | { ok: false; error: string } {
  if (raw == null) return { ok: true, value: null };

  if (typeof raw === "string" && raw.trim() === "") {
    return { ok: true, value: null };
  }

  const score = Number(raw);

  if (!Number.isFinite(score)) {
    return { ok: false, error: "INVALID_SCORE" };
  }

  if (score < 0 || score > MOCK_MAX_SCORE) {
    return { ok: false, error: "SCORE_OUT_OF_RANGE" };
  }

  return { ok: true, value: Math.round(score * 100) / 100 };
}

function mapScore(score: {
  studentId: string;
  score: number;
  comment: string | null;
}) {
  const grade = mockGradeFromScore(score.score);

  return {
    studentId: score.studentId,
    score: score.score,
    comment: score.comment ?? null,
    grade: grade?.grade ?? null,
    gradeLabel: grade?.label ?? null,
    remark: grade?.remark ?? null,
    nextGrade: grade?.nextGrade ?? null,
    pointsToNextGrade: grade?.pointsToNextGrade ?? null,
  };
}

async function getMockItem(itemId: string, tenantId: string) {
  return prisma.assessmentItem.findFirst({
    where: {
      id: itemId,
      tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      subject: true,
      term: true,
      academicYear: true,
      title: true,
      type: true,
      maxScore: true,
      status: true,
      lockedAt: true,
      mockExamSessionId: true,
      mockExamSession: {
        select: {
          id: true,
          tenantId: true,
          classroomId: true,
          academicYear: true,
          term: true,
          mockNumber: true,
          mockLabel: true,
          title: true,
          status: true,
          date: true,
          classroom: {
            select: {
              id: true,
              name: true,
              grade: true,
              arm: true,
            },
          },
        },
      },
    },
  });
}

function validateMockItem(item: MockItemForScores | null) {
  if (!item) {
    return {
      ok: false as const,
      status: 404,
      payload: { ok: false, error: "MOCK_ITEM_NOT_FOUND" },
    };
  }

  if (String(item.type ?? "").toUpperCase() !== "MOCK") {
    return {
      ok: false as const,
      status: 400,
      payload: {
        ok: false,
        error: "NOT_A_MOCK_ITEM",
        message: "This score route accepts only MOCK assessment items.",
      },
    };
  }

  if (!item.mockExamSessionId || !item.mockExamSession) {
    return {
      ok: false as const,
      status: 409,
      payload: {
        ok: false,
        error: "MOCK_SESSION_REQUIRED",
        message: "Mock scores must belong to a valid mock exam session.",
      },
    };
  }

  if (item.maxScore !== MOCK_MAX_SCORE) {
    return {
      ok: false as const,
      status: 409,
      payload: {
        ok: false,
        error: "MOCK_MAX_SCORE_MUST_BE_100",
        maxScore: item.maxScore,
      },
    };
  }

  if (!isJhs3MockClassroom(item.mockExamSession.classroom)) {
    return {
      ok: false as const,
      status: 400,
      payload: {
        ok: false,
        error: "MOCK_JHS3_ONLY",
        message: "BECE Mock is currently enabled only for JHS 3.",
        classroom: item.mockExamSession.classroom,
      },
    };
  }

  return { ok: true as const, item };
}

function mapItem(item: MockItemForScores) {
  return {
    id: item.id,
    classroomId: item.classroomId,
    subject: item.subject,
    term: item.term,
    academicYear: item.academicYear,
    title: item.title,
    type: item.type,
    maxScore: item.maxScore,
    status: item.status,
    lockedAt: item.lockedAt ? item.lockedAt.toISOString() : null,
    mockExamSessionId: item.mockExamSessionId,
  };
}

function mapSession(item: MockItemForScores) {
  const session = item.mockExamSession;

  return session
    ? {
        id: session.id,
        classroomId: session.classroomId,
        academicYear: session.academicYear,
        term: session.term,
        mockNumber: session.mockNumber,
        mockLabel: session.mockLabel,
        title: session.title,
        status: session.status,
        date: session.date ? session.date.toISOString() : null,
      }
    : null;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const itemId = cleanMockStr(searchParams.get("itemId"));

  if (!itemId) {
    return noStore(400, { ok: false, error: "MISSING_ITEM_ID" });
  }

  const item = await getMockItem(itemId, ctx.tenantId);
  const checked = validateMockItem(item);

  if (!checked.ok) {
    return noStore(checked.status, checked.payload);
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId: checked.item.classroomId,
    subject: checked.item.subject,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: access.reason,
    });
  }

  const students = await prisma.student.findMany({
    where: {
      tenantId: ctx.tenantId,
      classroomId: checked.item.classroomId,
      status: "ACTIVE",
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  const scores = await prisma.assessmentScore.findMany({
    where: {
      itemId: checked.item.id,
      studentId: { in: students.map((s) => s.id) },
    },
    orderBy: [{ createdAt: "asc" }],
    select: {
      studentId: true,
      score: true,
      comment: true,
    },
  });

  const scoreMap = new Map(scores.map((score) => [score.studentId, mapScore(score)]));

  return noStore(200, {
    ok: true,
    item: mapItem(checked.item),
    session: mapSession(checked.item),
    classroom: checked.item.mockExamSession?.classroom ?? null,
    access: {
      scopeSource: access.scopeSource,
      allowedSubjects: access.allowedSubjects,
    },
    students: students.map((student) => {
      const score = scoreMap.get(student.id) ?? null;

      return {
        id: student.id,
        name: studentName(student),
        score: score?.score ?? null,
        comment: score?.comment ?? null,
        grade: score?.grade ?? null,
        gradeLabel: score?.gradeLabel ?? null,
        remark: score?.remark ?? null,
        nextGrade: score?.nextGrade ?? null,
        pointsToNextGrade: score?.pointsToNextGrade ?? null,
      };
    }),
    scores: scores.map(mapScore),
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;

  try {
    const raw = await req.json().catch(() => null);
    const data = MockScoresUpsertSchema.parse(raw);

    const itemId = cleanMockStr(data.itemId);
    const item = await getMockItem(itemId, ctx.tenantId);
    const checked = validateMockItem(item);

    if (!checked.ok) {
      return noStore(checked.status, checked.payload);
    }

    if (checked.item.mockExamSession?.status !== "OPEN") {
      return noStore(409, {
        ok: false,
        error: "MOCK_SESSION_NOT_OPEN",
        status: checked.item.mockExamSession?.status ?? null,
      });
    }

    if (checked.item.lockedAt || String(checked.item.status ?? "").toUpperCase() === "LOCKED") {
      return noStore(409, {
        ok: false,
        error: "MOCK_ITEM_LOCKED",
      });
    }

    const access = await resolveUserClassroomAccess({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      roleName: ctx.roleName,
      classroomId: checked.item.classroomId,
      subject: checked.item.subject,
    });

    if (!access.ok) {
      return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
        ok: false,
        error: access.reason,
      });
    }

    const seen = new Set<string>();
    const normalizedRows: {
      studentId: string;
      score: number | null;
      comment: string | null;
    }[] = [];

    for (const row of data.scores) {
      const studentId = cleanMockStr(row.studentId);

      if (!studentId) {
        return noStore(400, {
          ok: false,
          error: "MISSING_STUDENT_ID",
        });
      }

      if (seen.has(studentId)) {
        return noStore(400, {
          ok: false,
          error: "DUPLICATE_STUDENT_SCORE",
          studentId,
        });
      }

      seen.add(studentId);

      const parsedScore = parseScore(row.score);

      if (!parsedScore.ok) {
        return noStore(400, {
          ok: false,
          error: parsedScore.error,
          studentId,
          maxScore: MOCK_MAX_SCORE,
        });
      }

      normalizedRows.push({
        studentId,
        score: parsedScore.value,
        comment: cleanMockStr(row.comment) || null,
      });
    }

    const activeStudents = await prisma.student.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId: checked.item.classroomId,
        status: "ACTIVE",
        id: {
          in: normalizedRows.map((row) => row.studentId),
        },
      },
      select: {
        id: true,
      },
    });

    const activeStudentIds = new Set(activeStudents.map((student) => student.id));
    const invalidStudentIds = normalizedRows
      .map((row) => row.studentId)
      .filter((studentId) => !activeStudentIds.has(studentId));

    if (invalidStudentIds.length > 0) {
      return noStore(400, {
        ok: false,
        error: "INVALID_STUDENTS_FOR_CLASSROOM",
        studentIds: invalidStudentIds,
      });
    }

    const rowsToUpsert = normalizedRows.filter((row) => row.score != null);
    const studentIdsToClear = normalizedRows
      .filter((row) => row.score == null)
      .map((row) => row.studentId);

    await prisma.$transaction([
      ...rowsToUpsert.map((row) =>
        prisma.assessmentScore.upsert({
          where: {
            assessment_student_unique: {
              itemId: checked.item.id,
              studentId: row.studentId,
            },
          },
          update: {
            score: row.score as number,
            comment: row.comment,
          },
          create: {
            itemId: checked.item.id,
            studentId: row.studentId,
            score: row.score as number,
            comment: row.comment,
          },
        })
      ),
      ...(studentIdsToClear.length
        ? [
            prisma.assessmentScore.deleteMany({
              where: {
                itemId: checked.item.id,
                studentId: { in: studentIdsToClear },
              },
            }),
          ]
        : []),
    ]);

    const savedScores = await prisma.assessmentScore.findMany({
      where: {
        itemId: checked.item.id,
      },
      orderBy: [{ createdAt: "asc" }],
      select: {
        studentId: true,
        score: true,
        comment: true,
      },
    });

    return noStore(200, {
      ok: true,
      itemId: checked.item.id,
      updatedCount: rowsToUpsert.length,
      clearedCount: studentIdsToClear.length,
      scores: savedScores.map(mapScore),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return noStore(400, {
        ok: false,
        error: "INVALID_DATA",
        details: err.flatten(),
      });
    }

    console.error("[MOCK_SCORES_UPSERT_ERROR]", err);
    return noStore(500, {
      ok: false,
      error: "FAILED_TO_SAVE_MOCK_SCORES",
    });
  }
}