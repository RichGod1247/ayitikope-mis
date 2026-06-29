//src/app/api/headteacher/assessment/mock/finalize/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  MOCK_CORE_SUBJECTS,
  MOCK_MAX_SCORE,
  MOCK_REQUIRED_FINALIZE_SUBJECTS,
  MOCK_SCHOOL_AGGREGATE_SUBJECTS,
  canonicalMockSubject,
  cleanMockStr,
  isJhs3MockClassroom,
  mockSubjectLabel,
} from "@/lib/assessments/mock";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FinalizeMockSessionSchema = z.object({
  sessionId: z.string().min(1),
});

const PLACEMENT_ELECTIVE_MINIMUM = 2;

function noStore(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function subjectKey(subject: unknown) {
  return canonicalMockSubject(subject);
}

function subjectLabel(canonicalSubject: string) {
  return mockSubjectLabel(canonicalSubject);
}

function isOpen(status: unknown) {
  return cleanMockStr(status).toUpperCase() === "OPEN";
}

function isLocked(status: unknown) {
  return cleanMockStr(status).toUpperCase() === "LOCKED";
}

function assignmentMatchesClass(args: {
  assignment: {
    classroomId: string | null;
    phase: string | null;
    level: string | null;
  };
  classroom: {
    id: string;
    name: string | null;
    grade: string | null;
    arm: string | null;
  };
}) {
  if (args.assignment.classroomId) {
    return args.assignment.classroomId === args.classroom.id;
  }

  const phase = subjectKey(args.assignment.phase);
  const level = subjectKey(args.assignment.level);
  const classText = subjectKey(
    `${args.classroom.name ?? ""} ${args.classroom.grade ?? ""}`,
  );

  if (phase === "JHS" && !level && isJhs3MockClassroom(args.classroom))
    return true;

  if (level === "JHS3" || level === "BASIC9" || level === "B9") {
    return (
      isJhs3MockClassroom(args.classroom) ||
      classText.includes("JHS3") ||
      classText.includes("BASIC9")
    );
  }

  return false;
}

async function buildSealCheck(args: { tenantId: string; sessionId: string }) {
  const session = await prisma.mockExamSession.findFirst({
    where: {
      id: args.sessionId,
      tenantId: args.tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      academicYear: true,
      mockNumber: true,
      mockLabel: true,
      title: true,
      status: true,
      classroom: {
        select: {
          id: true,
          name: true,
          grade: true,
          arm: true,
        },
      },
      items: {
        where: {
          type: "MOCK",
        },
        select: {
          id: true,
          subject: true,
          maxScore: true,
          status: true,
          lockedAt: true,
        },
        orderBy: [{ subject: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!session) {
    return {
      ok: false as const,
      status: 404,
      payload: { ok: false, error: "MOCK_SESSION_NOT_FOUND" },
    };
  }

  if (!isJhs3MockClassroom(session.classroom)) {
    return {
      ok: false as const,
      status: 400,
      payload: {
        ok: false,
        error: "MOCK_JHS3_ONLY",
        message: "BECE Mock finalization is currently enabled only for JHS 3.",
      },
    };
  }

  const activeStudents = await prisma.student.findMany({
    where: {
      tenantId: args.tenantId,
      classroomId: session.classroomId,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  const activeStudentIds = activeStudents.map((student) => student.id);
  const itemIds = session.items.map((item) => item.id);

  const scores = itemIds.length
    ? await prisma.assessmentScore.findMany({
        where: {
          itemId: { in: itemIds },
          studentId: { in: activeStudentIds },
        },
        select: {
          itemId: true,
          studentId: true,
        },
      })
    : [];

  const scoreSetByItem = new Map<string, Set<string>>();
  for (const score of scores) {
    const set = scoreSetByItem.get(score.itemId) ?? new Set<string>();
    set.add(score.studentId);
    scoreSetByItem.set(score.itemId, set);
  }

  const createdSubjectKeys = new Set(
    session.items
      .map((item) => subjectKey(item.subject))
      .filter((key) => key && key !== "UNKNOWN"),
  );

  const missingRequiredMockSubjectKeys = MOCK_REQUIRED_FINALIZE_SUBJECTS.filter(
    (subject) => !createdSubjectKeys.has(subject),
  );

  const missingRequiredMockSubjects =
    missingRequiredMockSubjectKeys.map(subjectLabel);

  const missingSchoolAggregateSubjects = MOCK_SCHOOL_AGGREGATE_SUBJECTS.filter(
    (subject) => !createdSubjectKeys.has(subject),
  ).map(subjectLabel);

  const missingCoreSubjects = MOCK_CORE_SUBJECTS.filter(
    (subject) => !createdSubjectKeys.has(subject),
  ).map(subjectLabel);

  const coreSubjectKeys = new Set<string>(
    MOCK_CORE_SUBJECTS as readonly string[],
  );
  const electiveColumnCount = session.items.filter(
    (item) => !coreSubjectKeys.has(subjectKey(item.subject)),
  ).length;

  const missingElectiveColumnCount = Math.max(
    0,
    PLACEMENT_ELECTIVE_MINIMUM - electiveColumnCount,
  );

  const scoreGaps = session.items
    .map((item) => {
      const scoredCount = scoreSetByItem.get(item.id)?.size ?? 0;
      const missingCount = Math.max(0, activeStudents.length - scoredCount);

      return {
        itemId: item.id,
        subject: item.subject,
        scoredCount,
        missingCount,
      };
    })
    .filter((gap) => gap.missingCount > 0);

  const invalidItems = session.items.filter(
    (item) => item.maxScore !== MOCK_MAX_SCORE,
  );

  const now = new Date();
  const ownerSubjectKeysToCheck = Array.from(
    new Set([
      ...Array.from(createdSubjectKeys),
      ...MOCK_REQUIRED_FINALIZE_SUBJECTS,
    ]),
  );
  const subjectNorms = ownerSubjectKeysToCheck;

  const assignments = await prisma.teacherAssessmentAssignment.findMany({
    where: {
      tenantId: args.tenantId,
      status: "ACTIVE",
      revokedAt: null,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
      assignmentKind: {
        in: ["CLASS_ALL_SUBJECTS", "SUBJECT"],
      },
    },
    select: {
      assignmentKind: true,
      classroomId: true,
      phase: true,
      level: true,
      subject: true,
      subjectNorm: true,
      teacherUserId: true,
    },
  });

  const ownedSubjectKeys = new Set<string>();

  for (const assignment of assignments) {
    if (!assignmentMatchesClass({ assignment, classroom: session.classroom }))
      continue;

    const kind = cleanMockStr(assignment.assignmentKind).toUpperCase();

    if (kind === "CLASS_ALL_SUBJECTS") {
      for (const subject of ownerSubjectKeysToCheck)
        ownedSubjectKeys.add(subject);
      continue;
    }

    if (kind !== "SUBJECT") continue;

    const key = subjectKey(assignment.subjectNorm || assignment.subject);
    if (key) ownedSubjectKeys.add(key);
  }

  const ownerGaps = missingRequiredMockSubjectKeys
    .filter((subject) => !ownedSubjectKeys.has(subject))
    .map(subjectLabel);

  const blockers: { code: string; label: string; detail: string }[] = [];

  if (activeStudents.length === 0) {
    blockers.push({
      code: "NO_ACTIVE_STUDENTS",
      label: "No active JHS 3 learners",
      detail: "A Mock session cannot be sealed without active JHS 3 learners.",
    });
  }

  if (session.items.length === 0) {
    blockers.push({
      code: "NO_SUBJECT_COLUMNS",
      label: "No Mock subject columns",
      detail: "Create the required Mock subject columns before finalization.",
    });
  }

  if (missingRequiredMockSubjects.length > 0) {
    blockers.push({
      code: "MISSING_REQUIRED_MOCK_SUBJECT_COLUMNS",
      label: "Missing required Mock subjects",
      detail: missingRequiredMockSubjects.join(", "),
    });
  }

  if (missingCoreSubjects.length > 0) {
    blockers.push({
      code: "MISSING_PLACEMENT_CORE_COLUMNS",
      label: "Missing placement core subjects",
      detail: missingCoreSubjects.join(", "),
    });
  }

  if (missingSchoolAggregateSubjects.length > 0) {
    blockers.push({
      code: "MISSING_SCHOOL_AGGREGATE_COLUMNS",
      label: "Missing school aggregate subjects",
      detail: missingSchoolAggregateSubjects.join(", "),
    });
  }

  if (missingElectiveColumnCount > 0) {
    blockers.push({
      code: "INSUFFICIENT_PLACEMENT_ELECTIVES",
      label: "Insufficient elective columns",
      detail: `Add ${missingElectiveColumnCount} more elective subject column(s).`,
    });
  }

  if (scoreGaps.length > 0) {
    blockers.push({
      code: "MISSING_SCORE_EVIDENCE",
      label: "Missing learner scores",
      detail: scoreGaps
        .map((gap) => `${gap.subject}: ${gap.missingCount} missing`)
        .join("; "),
    });
  }

  if (ownerGaps.length > 0) {
    blockers.push({
      code: "SUBJECT_OWNER_GAPS",
      label: "Subject owner gaps",
      detail: ownerGaps.join(", "),
    });
  }

  if (invalidItems.length > 0) {
    blockers.push({
      code: "INVALID_MOCK_MAX_SCORE",
      label: "Invalid Mock max score",
      detail: invalidItems
        .map((item) => `${item.subject}: max ${item.maxScore}`)
        .join("; "),
    });
  }

  return {
    ok: true as const,
    session,
    readiness: {
      ready: blockers.length === 0,
      sealed: isLocked(session.status),
      blockers,
      summary: {
        activeStudentCount: activeStudents.length,
        subjectColumnCount: session.items.length,
        scoreGapCount: scoreGaps.length,
        ownerGapCount: ownerGaps.length,
        missingRequiredMockSubjectCount: missingRequiredMockSubjects.length,
        missingCoreSubjectCount: missingCoreSubjects.length,
        missingSchoolAggregateSubjectCount:
          missingSchoolAggregateSubjects.length,
        missingElectiveColumnCount,
      },
    },
  };
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;

  try {
    const raw = await req.json().catch(() => null);
    const data = FinalizeMockSessionSchema.parse(raw);

    const sessionId = cleanMockStr(data.sessionId);
    const checked = await buildSealCheck({ tenantId: ctx.tenantId, sessionId });

    if (!checked.ok) {
      return noStore(checked.status, checked.payload);
    }

    if (checked.readiness.sealed) {
      return noStore(200, {
        ok: true,
        alreadyFinalized: true,
        sessionId: checked.session.id,
        status: checked.session.status,
        readiness: checked.readiness,
      });
    }

    if (!isOpen(checked.session.status)) {
      return noStore(409, {
        ok: false,
        error: "MOCK_SESSION_NOT_OPEN_FOR_FINALIZATION",
        status: checked.session.status,
      });
    }

    if (!checked.readiness.ready) {
      return noStore(409, {
        ok: false,
        error: "MOCK_SESSION_NOT_READY_TO_FINALIZE",
        readiness: checked.readiness,
      });
    }

    const now = new Date();

    await prisma.$transaction([
      prisma.assessmentItem.updateMany({
        where: {
          tenantId: ctx.tenantId,
          mockExamSessionId: checked.session.id,
          type: "MOCK",
        },
        data: {
          status: "LOCKED",
          lockedAt: now,
          lockedByUserId: ctx.userId,
        },
      }),
      prisma.mockExamSession.update({
        where: {
          id: checked.session.id,
        },
        data: {
          status: "LOCKED",
        },
      }),
    ]);

    return noStore(200, {
      ok: true,
      finalized: true,
      sessionId: checked.session.id,
      status: "LOCKED",
      finalizedAt: now.toISOString(),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return noStore(400, {
        ok: false,
        error: "INVALID_DATA",
        details: err.flatten(),
      });
    }

    console.error("[MOCK_SESSION_FINALIZE_ERROR]", err);
    return noStore(500, {
      ok: false,
      error: "FAILED_TO_FINALIZE_MOCK_SESSION",
    });
  }
}
