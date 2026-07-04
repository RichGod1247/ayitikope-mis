// src/app/api/parent/assessment/mock/readiness/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireParentSession, digitsOnly } from "@/lib/parentSession";
import { buildHeadteacherMockExportData } from "@/lib/assessments/mockExport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function cleanStr(v: unknown) {
  return String(v ?? "").trim();
}

function normDigits(v: unknown) {
  return digitsOnly(String(v ?? ""));
}

function phoneMatchesBySuffix(a: string, b: string) {
  const A = normDigits(a);
  const B = normDigits(b);
  if (!A || !B) return false;
  return A.endsWith(B) || B.endsWith(A);
}

function isValidSuffixForLookup(suffix: string) {
  return normDigits(suffix).length >= 7;
}

function parentOwnsStudent(args: {
  sessGuardianPhoneE164?: string | null;
  sessGuardianSuffix9?: string | null;
  studentGuardianPhoneNorm?: string | null;
  studentGuardianPhone?: string | null;
}) {
  const sessE164 = cleanStr(args.sessGuardianPhoneE164);
  const sessSuffix9 = normDigits(args.sessGuardianSuffix9);
  const guardianNorm = cleanStr(args.studentGuardianPhoneNorm);
  const guardianRaw = cleanStr(args.studentGuardianPhone);

  const okByE164 =
    !!sessE164 &&
    !!guardianNorm &&
    normDigits(sessE164) === normDigits(guardianNorm);

  const okBySuffix =
    isValidSuffixForLookup(sessSuffix9) &&
    (phoneMatchesBySuffix(sessSuffix9, guardianNorm) ||
      phoneMatchesBySuffix(sessSuffix9, guardianRaw));

  return okByE164 || okBySuffix;
}

function studentDisplayName(student: {
  firstName: string | null;
  lastName: string | null;
}) {
  return [student.firstName, student.lastName].filter(Boolean).join(" ").trim() || "Learner";
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function canonicalSubjectKey(value: unknown) {
  return cleanStr(value)
    .toUpperCase()
    .replace(/&/g, "AND")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildSubjectScoreMap(row: any) {
  const map = new Map<
    string,
    {
      subject: string;
      score: number | null;
    }
  >();

  const cells = Array.isArray(row?.subjectCells) ? row.subjectCells : [];

  for (const cell of cells) {
    const subject = cleanStr(cell?.subject);
    const key = canonicalSubjectKey(cell?.canonicalSubject || cell?.subject);
    if (!subject || !key) continue;

    map.set(key, {
      subject,
      score: numberOrNull(cell?.score),
    });
  }

  return map;
}

function parentTrendAction(args: {
  label: "IMPROVING" | "DECLINING" | "STABLE" | "INCOMPLETE";
  needsSupportSubject: string | null;
}) {
  if (args.label === "IMPROVING") {
    return "Celebrate the progress, keep the revision routine steady, and help your child protect the subjects that improved.";
  }

  if (args.label === "DECLINING") {
    return `Encourage correction work before the next Mock${
      args.needsSupportSubject ? `, especially in ${args.needsSupportSubject}` : ""
    }. You may also speak with the school for guidance.`;
  }

  if (args.label === "STABLE") {
    return "Keep the study routine consistent and help your child revise corrections from the latest Mock.";
  }

  return "Trend will become clearer after the school releases another Mock report for this learner.";
}

function buildParentMockTrend(args: {
  currentRelease: {
    mockExamSessionId: string;
    mockLabel: string;
    title: string;
  };
  currentRow: any;
  previousRelease: {
    mockExamSessionId: string;
    mockLabel: string;
    title: string;
  } | null;
  previousRow: any | null;
}) {
  if (!args.previousRelease || !args.previousRow) {
    return {
      available: false,
      label: "INCOMPLETE",
      previousMockLabel: null,
      latestMockLabel: args.currentRelease.mockLabel,
      previousPlacementAggregate: null,
      latestPlacementAggregate:
        numberOrNull(args.currentRow?.placementAggregate?.aggregate),
      aggregateMovement: null,
      previousAverageScore: null,
      latestAverageScore: numberOrNull(args.currentRow?.averageScore),
      averageScoreMovement: null,
      bestImprovement: null,
      needsSupport: null,
      parentAction:
        "Trend will appear after at least two released Mock reports are available for this learner.",
    };
  }

  const previousPlacementAggregate = numberOrNull(
    args.previousRow?.placementAggregate?.aggregate,
  );
  const latestPlacementAggregate = numberOrNull(
    args.currentRow?.placementAggregate?.aggregate,
  );

  const previousAverageScore = numberOrNull(args.previousRow?.averageScore);
  const latestAverageScore = numberOrNull(args.currentRow?.averageScore);

  // For aggregate, lower is better, so previous - latest is positive improvement.
  const aggregateMovement =
    previousPlacementAggregate != null && latestPlacementAggregate != null
      ? round1(previousPlacementAggregate - latestPlacementAggregate)
      : null;

  const averageScoreMovement =
    previousAverageScore != null && latestAverageScore != null
      ? round1(latestAverageScore - previousAverageScore)
      : null;

  const previousSubjects = buildSubjectScoreMap(args.previousRow);
  const latestSubjects = buildSubjectScoreMap(args.currentRow);

  const subjectMovements: {
    subject: string;
    previousScore: number;
    latestScore: number;
    scoreMovement: number;
  }[] = [];

  for (const [key, latest] of latestSubjects.entries()) {
    const previous = previousSubjects.get(key);
    if (!previous) continue;
    if (previous.score == null || latest.score == null) continue;

    subjectMovements.push({
      subject: latest.subject || previous.subject,
      previousScore: previous.score,
      latestScore: latest.score,
      scoreMovement: round1(latest.score - previous.score),
    });
  }

  const bestImprovement =
    subjectMovements
      .filter((row) => row.scoreMovement > 0)
      .sort((a, b) => b.scoreMovement - a.scoreMovement)[0] ?? null;

  const needsSupport =
    subjectMovements
      .filter((row) => row.scoreMovement < 0)
      .sort((a, b) => a.scoreMovement - b.scoreMovement)[0] ?? null;

  let label: "IMPROVING" | "DECLINING" | "STABLE" | "INCOMPLETE" =
    "INCOMPLETE";

  if (
    aggregateMovement != null ||
    averageScoreMovement != null ||
    subjectMovements.length > 0
  ) {
    if (
      (aggregateMovement != null && aggregateMovement > 0) ||
      (aggregateMovement == null &&
        averageScoreMovement != null &&
        averageScoreMovement > 0)
    ) {
      label = "IMPROVING";
    } else if (
      (aggregateMovement != null && aggregateMovement < 0) ||
      (aggregateMovement == null &&
        averageScoreMovement != null &&
        averageScoreMovement < 0)
    ) {
      label = "DECLINING";
    } else {
      label = "STABLE";
    }
  }

  return {
    available: true,
    label,
    previousMockLabel: args.previousRelease.mockLabel,
    latestMockLabel: args.currentRelease.mockLabel,
    previousPlacementAggregate,
    latestPlacementAggregate,
    aggregateMovement,
    previousAverageScore,
    latestAverageScore,
    averageScoreMovement,
    bestImprovement: bestImprovement
      ? {
          subject: bestImprovement.subject,
          previousScore: bestImprovement.previousScore,
          latestScore: bestImprovement.latestScore,
          scoreMovement: bestImprovement.scoreMovement,
        }
      : null,
    needsSupport: needsSupport
      ? {
          subject: needsSupport.subject,
          previousScore: needsSupport.previousScore,
          latestScore: needsSupport.latestScore,
          scoreMovement: needsSupport.scoreMovement,
        }
      : null,
    parentAction: parentTrendAction({
      label,
      needsSupportSubject: needsSupport?.subject ?? null,
    }),
  };
}

function parentSafeReadinessCopy(row: {
  readiness: { code: string; label: string; action: string };
  placementAggregate: { ok: boolean; aggregate: number | null; missingSubjects: string[] };
  weakestSubject: string | null;
  strongestSubject: string | null;
  missingSubjectCount: number;
}) {
  const code = cleanStr(row.readiness.code).toUpperCase();
  const aggregate = row.placementAggregate.aggregate;

  if (!row.placementAggregate.ok || row.missingSubjectCount > 0) {
    return {
      code: "INCOMPLETE",
      label: "Readiness evidence still incomplete",
      message:
        "Some subject evidence is still missing. Support steady revision while the school completes the remaining evidence.",
      homeSupport:
        "Ask your child to revise all core subjects this week and check with the class teacher for any missing Mock evidence.",
    };
  }

  if (typeof aggregate === "number" && aggregate <= 12) {
    return {
      code: "STRONG",
      label: "Strong current readiness",
      message:
        "Your child is currently showing strong readiness signals from this Mock.",
      homeSupport:
        "Protect the progress with regular revision, past questions, and calm consistency.",
    };
  }

  if (typeof aggregate === "number" && aggregate <= 18) {
    return {
      code: "GOOD",
      label: "Good readiness with room to improve",
      message:
        "Your child has a useful foundation, but a few subjects can still improve the aggregate.",
      homeSupport: `Focus extra home support on ${
        row.weakestSubject ?? "the weaker subjects"
      } before the next Mock.`,
    };
  }

  if (
    code.includes("RISK") ||
    code.includes("CRITICAL") ||
    (typeof aggregate === "number" && aggregate > 18)
  ) {
    return {
      code: "SUPPORT_NEEDED",
      label: "Current support area",
      message:
        "This Mock shows areas where your child needs stronger support before the next assessment.",
      homeSupport: `Create a simple weekly study routine and give extra attention to ${
        row.weakestSubject ?? "the weaker subjects"
      }. Contact the school for guidance if needed.`,
    };
  }

  return {
    code: "MONITOR",
    label: "Monitor and support",
    message:
      "Your child has useful evidence from this Mock. Keep supporting steady improvement.",
    homeSupport:
      "Review corrections, practise past questions, and keep attendance consistent.",
  };
}

export async function GET(req: NextRequest) {
  try {
    const gate = requireParentSession(req as any);
    if (!gate.ok) return gate.res as any;

    const sess = gate.session;
    const { searchParams } = new URL(req.url);

    const studentId = cleanStr(searchParams.get("studentId"));
    const requestedSessionId = cleanStr(searchParams.get("sessionId"));

    if (!studentId) {
      return noStoreJson({ ok: false, error: "MISSING_STUDENT_ID" }, 400);
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: sess.tenantId },
      select: { id: true, name: true, status: true },
    });

    if (!tenant) {
      return noStoreJson({ ok: false, error: "TENANT_NOT_FOUND" }, 401);
    }

    if (tenant.status !== "ACTIVE") {
      return noStoreJson({ ok: false, error: "TENANT_NOT_ACTIVE" }, 403);
    }

    const student = await prisma.student.findFirst({
      where: {
        id: studentId,
        tenantId: sess.tenantId,
        status: "ACTIVE",
      },
      select: {
        id: true,
        tenantId: true,
        classroomId: true,
        firstName: true,
        lastName: true,
        guardianName: true,
        guardianPhone: true,
        guardianPhoneNorm: true,
        classroom: {
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
        },
      },
    });

    if (!student) {
      return noStoreJson({ ok: false, error: "STUDENT_NOT_FOUND" }, 404);
    }

    const ownsStudent = parentOwnsStudent({
      sessGuardianPhoneE164: sess.guardianPhoneE164,
      sessGuardianSuffix9: sess.guardianSuffix9,
      studentGuardianPhoneNorm: student.guardianPhoneNorm,
      studentGuardianPhone: student.guardianPhone,
    });

    if (!ownsStudent) {
      return noStoreJson({ ok: false, error: "GUARDIAN_MISMATCH" }, 403);
    }

    if (!student.classroomId) {
      return noStoreJson(
        { ok: false, error: "STUDENT_CLASSROOM_NOT_ASSIGNED" },
        409,
      );
    }

    const release = await prisma.mockResultsRelease.findFirst({
      where: {
        tenantId: sess.tenantId,
        classroomId: student.classroomId,
        ...(requestedSessionId ? { mockExamSessionId: requestedSessionId } : {}),
        parentVisible: true,
        readinessStatus: { in: ["READY", "OVERRIDE"] },
        releaseSnapshotHash: { not: "" },
        mockExamSession: {
          tenantId: sess.tenantId,
          classroomId: student.classroomId,
          status: "LOCKED",
        },
      },
      orderBy: [{ releasedAt: "desc" }],
      select: {
        id: true,
        mockExamSessionId: true,
        classroomId: true,
        academicYear: true,
        term: true,
        mockNumber: true,
        mockLabel: true,
        title: true,
        readinessStatus: true,
        readinessScore: true,
        releaseSnapshotHash: true,
        releaseMode: true,
        parentVisible: true,
        smsNotifiedAt: true,
        releasedAt: true,
        releasedByUser: {
          select: {
            name: true,
            email: true,
          },
        },
        mockExamSession: {
          select: {
            id: true,
            status: true,
            title: true,
            mockLabel: true,
            mockNumber: true,
            academicYear: true,
            term: true,
          },
        },
      },
    });

    if (!release) {
      return noStoreJson(
        {
          ok: false,
          error: "MOCK_RESULTS_NOT_RELEASED",
          message:
            "Mock readiness has not yet been released by the headteacher for this learner.",
        },
        403,
      );
    }

    const exportData = await buildHeadteacherMockExportData({
      tenantId: sess.tenantId,
      sessionId: release.mockExamSessionId,
    });

    if (!exportData) {
      return noStoreJson(
        {
          ok: false,
          error: "MOCK_READINESS_TRUTH_UNAVAILABLE",
          message:
            "Released Mock readiness exists, but the underlying Mock evidence could not be loaded.",
        },
        409,
      );
    }

    const row = exportData.rows.find((r) => r.studentId === student.id);

    if (!row) {
      return noStoreJson(
        {
          ok: false,
          error: "STUDENT_NOT_IN_RELEASED_MOCK",
          message:
            "This learner was not found in the released Mock readiness evidence.",
        },
        404,
      );
    }

const parentCopy = parentSafeReadinessCopy(row);

const previousRelease = await prisma.mockResultsRelease.findFirst({
  where: {
    tenantId: sess.tenantId,
    classroomId: student.classroomId,
    parentVisible: true,
    readinessStatus: { in: ["READY", "OVERRIDE"] },
    releaseSnapshotHash: { not: "" },
    mockExamSession: {
      tenantId: sess.tenantId,
      classroomId: student.classroomId,
      academicYear: release.academicYear,
      status: "LOCKED",
      mockNumber: { lt: release.mockNumber },
    },
  },
  orderBy: [
    { mockNumber: "desc" },
    { releasedAt: "desc" },
  ],
  select: {
    id: true,
    mockExamSessionId: true,
    mockNumber: true,
    mockLabel: true,
    title: true,
  },
});

let previousRow: any | null = null;

if (previousRelease) {
  const previousExportData = await buildHeadteacherMockExportData({
    tenantId: sess.tenantId,
    sessionId: previousRelease.mockExamSessionId,
  });

  previousRow =
    previousExportData?.rows.find((r) => r.studentId === student.id) ?? null;
}

const mockTrend = buildParentMockTrend({
  currentRelease: {
    mockExamSessionId: release.mockExamSessionId,
    mockLabel: release.mockLabel,
    title: release.title,
  },
  currentRow: row,
  previousRelease: previousRelease
    ? {
        mockExamSessionId: previousRelease.mockExamSessionId,
        mockLabel: previousRelease.mockLabel,
        title: previousRelease.title,
      }
    : null,
  previousRow,
});

const scoredSubjects = row.subjectCells.filter((cell) => cell.score != null);

    const strongestSubjects = [...scoredSubjects]
      .sort((a, b) => {
        const ga = Number(a.grade ?? 99);
        const gb = Number(b.grade ?? 99);
        if (ga !== gb) return ga - gb;
        return Number(b.score ?? 0) - Number(a.score ?? 0);
      })
      .slice(0, 3)
      .map((cell) => ({
        subject: cell.subject,
        score: cell.score,
        grade: cell.grade,
        gradeLabel: cell.gradeLabel,
        remark: cell.remark,
      }));

    const weakestSubjects = [...scoredSubjects]
      .sort((a, b) => {
        const ga = Number(a.grade ?? -1);
        const gb = Number(b.grade ?? -1);
        if (ga !== gb) return gb - ga;
        return Number(a.score ?? 0) - Number(b.score ?? 0);
      })
      .slice(0, 3)
      .map((cell) => ({
        subject: cell.subject,
        score: cell.score,
        grade: cell.grade,
        gradeLabel: cell.gradeLabel,
        remark: cell.remark,
        pointsToNextGrade: cell.pointsToNextGrade,
        nextGrade: cell.nextGrade,
      }));

    return noStoreJson({
      ok: true,
      context: {
        tenantId: sess.tenantId,
        tenantName: tenant.name,
        studentId: student.id,
        classroomId: student.classroomId,
        mockExamSessionId: release.mockExamSessionId,
      },
      release: {
        id: release.id,
        releasedAt: release.releasedAt.toISOString(),
        releasedByName:
          cleanStr(release.releasedByUser?.name) ||
          cleanStr(release.releasedByUser?.email) ||
          null,
        readinessStatus: String(release.readinessStatus),
        readinessScore: Number(release.readinessScore ?? 0),
        releaseSnapshotHash: release.releaseSnapshotHash,
        releaseMode: release.releaseMode,
        smsNotifiedAt: release.smsNotifiedAt
          ? release.smsNotifiedAt.toISOString()
          : null,
      },
      session: exportData.session,
      student: {
        id: student.id,
        name: studentDisplayName(student),
        classroom: student.classroom,
      },
      summary: {
        classAverageScore: exportData.summary.classAverageScore,
        classAveragePlacementAggregate:
          exportData.summary.classAveragePlacementAggregate,
        classPlacementReadyCount: exportData.summary.placementReadyCount,
        classTotalStudents: exportData.summary.totalStudents,
        completionPercent: exportData.summary.completionPercent,
      },
      readiness: {
        raw: row.readiness,
        parent: parentCopy,
      },
      aggregates: {
        school: row.schoolAggregate,
        placement: row.placementAggregate,
      },
      scores: {
        averageScore: row.averageScore,
        scoredSubjectCount: row.scoredSubjectCount,
        missingSubjectCount: row.missingSubjectCount,
        subjects: row.subjectCells,
      },
  strongestSubjects,
weakestSubjects,
mockTrend,
parentHomeSupport: parentCopy.homeSupport,
recommendedAction: row.recommendedAction,
    });
  } catch (err) {
    console.error("[PARENT_MOCK_READINESS_ERROR]", err);
    return noStoreJson(
      { ok: false, error: "FAILED_TO_LOAD_PARENT_MOCK_READINESS" },
      500,
    );
  }
}