//src/app/api/headteacher/assessment/mock/interventions/route.ts
import {
  GovernanceInterventionEventType,
  GovernanceInterventionPriority,
  GovernanceInterventionScopeType,
  GovernanceInterventionStatus,
  Prisma,
  StudentStatus,
} from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { cleanMockStr, isJhs3MockClassroom } from "@/lib/assessments/mock";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTIVE_CASE_STATUSES = [
  GovernanceInterventionStatus.OPEN,
  GovernanceInterventionStatus.IN_PROGRESS,
  GovernanceInterventionStatus.ESCALATED,
];

const caseSelect = {
  id: true,
  tenantId: true,
  zoneId: true,
  scopeType: true,
  title: true,
  summary: true,
  priority: true,
  status: true,
  riskScore: true,
  riskLevel: true,
  riskSnapshot: true,
  recommendedActions: true,
  dueAt: true,
  createdByUserId: true,
  assignedToUserId: true,
  resolvedByUserId: true,
  cancelledByUserId: true,
  resolvedAt: true,
  escalatedAt: true,
  cancelledAt: true,
  resolutionNote: true,
  cancellationReason: true,
  metadata: true,
  createdAt: true,
  updatedAt: true,
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  assignedTo: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  events: {
    orderBy: {
      createdAt: "desc" as const,
    },
    take: 10,
    select: {
      id: true,
      eventType: true,
      fromStatus: true,
      toStatus: true,
      note: true,
      metadata: true,
      createdAt: true,
      actor: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  },
} satisfies Prisma.GovernanceInterventionCaseSelect;

type MockInterventionCaseRow = Prisma.GovernanceInterventionCaseGetPayload<{
  select: typeof caseSelect;
}>;

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function safeJson(value: unknown, fallback: unknown): Prisma.InputJsonValue {
  try {
    const safe = value === undefined ? fallback : value;
    return JSON.parse(JSON.stringify(safe)) as Prisma.InputJsonValue;
  } catch {
    return JSON.parse(JSON.stringify(fallback)) as Prisma.InputJsonValue;
  }
}

function safeJsonObject(value: unknown): Prisma.InputJsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return safeJson({}, {});
  }

  return safeJson(value, {});
}

function safeJsonArray(value: unknown): Prisma.InputJsonValue {
  if (!Array.isArray(value)) return safeJson([], []);
  return safeJson(value, []);
}

function dateOrNull(value: unknown) {
  const s = cleanMockStr(value);
  if (!s) return null;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "INVALID_DATE" as const;

  return d;
}

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePriority(value: unknown) {
  const v = cleanMockStr(value).toUpperCase();

  if (v === "CRITICAL") return GovernanceInterventionPriority.CRITICAL;
  if (v === "HIGH") return GovernanceInterventionPriority.HIGH;
  if (v === "LOW") return GovernanceInterventionPriority.LOW;

  return GovernanceInterventionPriority.MEDIUM;
}

function defaultPriority(args: {
  trendLabel: string;
  aggregateMovement: number | null;
  averageScoreMovement: number | null;
}) {
  const trend = cleanMockStr(args.trendLabel).toUpperCase();

  if (
    trend === "DECLINING" &&
    ((args.aggregateMovement != null && args.aggregateMovement <= -5) ||
      (args.averageScoreMovement != null && args.averageScoreMovement <= -10))
  ) {
    return GovernanceInterventionPriority.CRITICAL;
  }

  if (trend === "DECLINING") return GovernanceInterventionPriority.HIGH;
  if (trend === "INCOMPLETE") return GovernanceInterventionPriority.MEDIUM;
  if (trend === "IMPROVING") return GovernanceInterventionPriority.LOW;

  return GovernanceInterventionPriority.MEDIUM;
}

function priorityRiskScore(priority: GovernanceInterventionPriority) {
  if (priority === GovernanceInterventionPriority.CRITICAL) return 85;
  if (priority === GovernanceInterventionPriority.HIGH) return 70;
  if (priority === GovernanceInterventionPriority.MEDIUM) return 45;
  return 20;
}

type MockInterventionLifecycleAction =
  | "START"
  | "RESOLVE"
  | "ESCALATE"
  | "REOPEN"
  | "CANCEL";

function normalizeLifecycleAction(value: unknown): MockInterventionLifecycleAction | null {
  const action = cleanMockStr(value).toUpperCase();

  if (action === "START") return "START";
  if (action === "RESOLVE") return "RESOLVE";
  if (action === "ESCALATE") return "ESCALATE";
  if (action === "REOPEN") return "REOPEN";
  if (action === "CANCEL") return "CANCEL";

  return null;
}

function isTerminalStatus(status: GovernanceInterventionStatus) {
  return (
    status === GovernanceInterventionStatus.RESOLVED ||
    status === GovernanceInterventionStatus.CANCELLED
  );
}

function lifecycleEventType(action: MockInterventionLifecycleAction) {
  if (action === "RESOLVE") return GovernanceInterventionEventType.RESOLVED;
  if (action === "ESCALATE") return GovernanceInterventionEventType.ESCALATED;
  if (action === "REOPEN") return GovernanceInterventionEventType.REOPENED;
  if (action === "CANCEL") return GovernanceInterventionEventType.CANCELLED;

  return GovernanceInterventionEventType.STATUS_CHANGED;
}

function defaultLifecycleNote(action: MockInterventionLifecycleAction) {
  if (action === "START") return "Mock rescue intervention work started.";
  if (action === "RESOLVE") return "Mock rescue intervention resolved with evidence.";
  if (action === "ESCALATE") return "Mock rescue intervention escalated for higher attention.";
  if (action === "REOPEN") return "Mock rescue intervention reopened for continued action.";
  if (action === "CANCEL") return "Mock rescue intervention cancelled.";

  return "Mock rescue intervention updated.";
}

function mapCase(row: MockInterventionCaseRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    zoneId: row.zoneId,
    scopeType: row.scopeType,
    title: row.title,
    summary: row.summary,
    priority: row.priority,
    status: row.status,
    riskScore: row.riskScore,
    riskLevel: row.riskLevel,
    riskSnapshot: row.riskSnapshot,
    recommendedActions: row.recommendedActions,
    dueAt: row.dueAt ? row.dueAt.toISOString() : null,
    createdByUserId: row.createdByUserId,
    assignedToUserId: row.assignedToUserId,
    resolvedByUserId: row.resolvedByUserId,
    cancelledByUserId: row.cancelledByUserId,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    escalatedAt: row.escalatedAt ? row.escalatedAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    resolutionNote: row.resolutionNote,
    cancellationReason: row.cancellationReason,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdBy: row.createdBy,
    assignedTo: row.assignedTo,
    events: row.events.map((event) => ({
      id: event.id,
      eventType: event.eventType,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      metadata: event.metadata,
      createdAt: event.createdAt.toISOString(),
      actor: event.actor,
    })),
  };
}

async function loadMockSessionOrFail(args: {
  tenantId: string;
  sessionId: string;
}) {
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
      term: true,
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
          status: true,
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          schoolCode: true,
          zoneId: true,
        },
      },
    },
  });

  if (!session) {
    return {
      ok: false as const,
      res: json(404, { ok: false, error: "MOCK_SESSION_NOT_FOUND" }),
    };
  }

  if (!isJhs3MockClassroom(session.classroom)) {
    return {
      ok: false as const,
      res: json(400, {
        ok: false,
        error: "MOCK_JHS3_ONLY",
        message: "Mock intervention tracking is currently enabled only for JHS 3.",
      }),
    };
  }

  if (cleanMockStr(session.status).toUpperCase() !== "LOCKED") {
    return {
      ok: false as const,
      res: json(409, {
        ok: false,
        error: "MOCK_SESSION_NOT_LOCKED",
        message:
          "Seal the Mock session before opening intervention cases from its trend evidence.",
      }),
    };
  }

  return { ok: true as const, session };
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const sessionId = cleanMockStr(searchParams.get("sessionId"));
  const status = cleanMockStr(searchParams.get("status")).toUpperCase();

  if (!sessionId) {
    return json(400, { ok: false, error: "MISSING_SESSION_ID" });
  }

  const loaded = await loadMockSessionOrFail({
    tenantId: ctx.tenantId,
    sessionId,
  });

  if (!loaded.ok) return loaded.res;

  const where: Prisma.GovernanceInterventionCaseWhereInput = {
    tenantId: ctx.tenantId,
    scopeType: GovernanceInterventionScopeType.SCHOOL,
    metadata: {
      path: ["mockSessionId"],
      equals: loaded.session.id,
    },
  };

  if (status) {
    if (
      !Object.values(GovernanceInterventionStatus).includes(
        status as GovernanceInterventionStatus,
      )
    ) {
      return json(400, { ok: false, error: "INVALID_STATUS" });
    }

    where.status = status as GovernanceInterventionStatus;
  }

  const items = await prisma.governanceInterventionCase.findMany({
    where,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: caseSelect,
  });

  return json(200, {
    ok: true,
    session: {
      id: loaded.session.id,
      title: loaded.session.title,
      mockLabel: loaded.session.mockLabel,
      status: loaded.session.status,
      classroomId: loaded.session.classroomId,
    },
    items: items.map(mapCase),
    count: items.length,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const body = (await req.json().catch(() => null)) ?? {};

  const sessionId = cleanMockStr((body as Record<string, unknown>).sessionId);
  const studentId = cleanMockStr((body as Record<string, unknown>).studentId);
  const studentNameInput = cleanMockStr(
    (body as Record<string, unknown>).studentName,
  );
  const trendLabel = cleanMockStr(
    (body as Record<string, unknown>).trendLabel,
  ).toUpperCase();

  if (!sessionId) {
    return json(400, { ok: false, error: "MISSING_SESSION_ID" });
  }

  if (!studentId) {
    return json(400, { ok: false, error: "MISSING_STUDENT_ID" });
  }

  const loaded = await loadMockSessionOrFail({
    tenantId: ctx.tenantId,
    sessionId,
  });

  if (!loaded.ok) return loaded.res;

  const student = await prisma.student.findFirst({
    where: {
      id: studentId,
      tenantId: ctx.tenantId,
      classroomId: loaded.session.classroomId,
      status: StudentStatus.ACTIVE,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!student) {
    return json(404, { ok: false, error: "STUDENT_NOT_FOUND_FOR_MOCK_SESSION" });
  }

  const studentName =
    studentNameInput ||
    `${student.firstName || ""} ${student.lastName || ""}`.trim() ||
    "Learner";

  const aggregateMovement = numberOrNull(
    (body as Record<string, unknown>).aggregateMovement,
  );
  const averageScoreMovement = numberOrNull(
    (body as Record<string, unknown>).averageScoreMovement,
  );

  const recommendedAction =
    cleanMockStr((body as Record<string, unknown>).recommendedAction) ||
    "Assign targeted support before the next Mock.";

  const declinedSubjects = Array.isArray(
    (body as Record<string, unknown>).declinedSubjects,
  )
    ? ((body as Record<string, unknown>).declinedSubjects as unknown[])
    : [];

  const improvedSubjects = Array.isArray(
    (body as Record<string, unknown>).improvedSubjects,
  )
    ? ((body as Record<string, unknown>).improvedSubjects as unknown[])
    : [];

  const nearGradeOpportunities = Array.isArray(
    (body as Record<string, unknown>).nearGradeOpportunities,
  )
    ? ((body as Record<string, unknown>).nearGradeOpportunities as unknown[])
    : [];

  const dueAt = dateOrNull((body as Record<string, unknown>).dueAt);
  if (dueAt === "INVALID_DATE") {
    return json(400, { ok: false, error: "INVALID_DUE_DATE" });
  }

  const priority = normalizePriority(
    (body as Record<string, unknown>).priority ||
      defaultPriority({
        trendLabel,
        aggregateMovement,
        averageScoreMovement,
      }),
  );

  const riskScore = priorityRiskScore(priority);
  const mockInterventionKey = `MOCK_TREND:${loaded.session.id}:${student.id}`;

  const existing = await prisma.governanceInterventionCase.findFirst({
    where: {
      tenantId: ctx.tenantId,
      scopeType: GovernanceInterventionScopeType.SCHOOL,
      status: {
        in: ACTIVE_CASE_STATUSES,
      },
      metadata: {
        path: ["mockInterventionKey"],
        equals: mockInterventionKey,
      },
    },
    select: caseSelect,
  });

  if (existing) {
    return json(200, {
      ok: true,
      reused: true,
      item: mapCase(existing),
    });
  }

  const title = `Mock rescue: ${studentName}`;
  const summary =
    cleanMockStr((body as Record<string, unknown>).summary) ||
    `${studentName} requires targeted intervention after ${loaded.session.mockLabel}. Trend: ${
      trendLabel || "UNSPECIFIED"
    }. ${recommendedAction}`;

  const riskSnapshot = {
    source: "HEADTEACHER_MOCK_TREND",
    mockSessionId: loaded.session.id,
    mockLabel: loaded.session.mockLabel,
    mockTitle: loaded.session.title,
    classroomId: loaded.session.classroomId,
    academicYear: loaded.session.academicYear,
    term: loaded.session.term,
    studentId: student.id,
    studentName,
    trendLabel,
    aggregateMovement,
    averageScoreMovement,
    declinedSubjects,
    improvedSubjects,
    nearGradeOpportunities,
  };

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.governanceInterventionCase.create({
      data: {
        tenantId: ctx.tenantId,
        zoneId: loaded.session.tenant.zoneId,
        scopeType: GovernanceInterventionScopeType.SCHOOL,
        title,
        summary,
        priority,
        status: GovernanceInterventionStatus.OPEN,
        riskScore,
        riskLevel: priority,
        riskSnapshot: safeJsonObject(riskSnapshot),
        recommendedActions: safeJsonArray([recommendedAction]),
        dueAt,
        createdByUserId: ctx.userId,
        assignedToUserId: ctx.userId,
        metadata: safeJsonObject({
          source: "HEADTEACHER_MOCK_TREND",
          mockInterventionKey,
          mockSessionId: loaded.session.id,
          mockLabel: loaded.session.mockLabel,
          mockTitle: loaded.session.title,
          classroomId: loaded.session.classroomId,
          academicYear: loaded.session.academicYear,
          term: loaded.session.term,
          studentId: student.id,
          studentName,
          trendLabel,
          aggregateMovement,
          averageScoreMovement,
          recommendedAction,
        }),
      },
      select: caseSelect,
    });

    await tx.governanceInterventionEvent.create({
      data: {
        caseId: created.id,
        actorUserId: ctx.userId,
        eventType: GovernanceInterventionEventType.CREATED,
        toStatus: GovernanceInterventionStatus.OPEN,
        note: `Mock rescue intervention opened for ${studentName}.`,
        metadata: safeJsonObject({
          source: "HEADTEACHER_MOCK_TREND",
          mockSessionId: loaded.session.id,
          studentId: student.id,
          trendLabel,
          priority,
        }),
      },
    });

    await tx.governanceInterventionEvent.create({
      data: {
        caseId: created.id,
        actorUserId: ctx.userId,
        eventType: GovernanceInterventionEventType.ASSIGNED,
        toStatus: GovernanceInterventionStatus.OPEN,
        note: "Mock rescue intervention assigned to the headteacher for follow-up.",
        metadata: safeJsonObject({
          assignedToUserId: ctx.userId,
          source: "HEADTEACHER_MOCK_TREND",
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: "MOCK_TREND_INTERVENTION_CREATED",
        resource: "GovernanceInterventionCase",
        resourceId: created.id,
        metadata: safeJsonObject({
          mockSessionId: loaded.session.id,
          studentId: student.id,
          trendLabel,
          priority,
        }),
      },
    });

    return tx.governanceInterventionCase.findUniqueOrThrow({
      where: { id: created.id },
      select: caseSelect,
    });
  });

  return json(201, {
    ok: true,
    reused: false,
    item: mapCase(item),
  });
}
export async function PATCH(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const body = (await req.json().catch(() => null)) ?? {};
  const record = body as Record<string, unknown>;

  const sessionId = cleanMockStr(record.sessionId);
  const caseId = cleanMockStr(record.caseId);
  const action = normalizeLifecycleAction(record.action);
  const note =
    cleanMockStr(record.note) ||
    cleanMockStr(record.evidenceNote) ||
    cleanMockStr(record.reason);

  if (!sessionId) {
    return json(400, { ok: false, error: "MISSING_SESSION_ID" });
  }

  if (!caseId) {
    return json(400, { ok: false, error: "MISSING_CASE_ID" });
  }

  if (!action) {
    return json(400, { ok: false, error: "INVALID_INTERVENTION_ACTION" });
  }

  const loaded = await loadMockSessionOrFail({
    tenantId: ctx.tenantId,
    sessionId,
  });

  if (!loaded.ok) return loaded.res;

  const existing = await prisma.governanceInterventionCase.findFirst({
    where: {
      id: caseId,
      tenantId: ctx.tenantId,
      scopeType: GovernanceInterventionScopeType.SCHOOL,
      metadata: {
        path: ["mockSessionId"],
        equals: loaded.session.id,
      },
    },
    select: caseSelect,
  });

  if (!existing) {
    return json(404, {
      ok: false,
      error: "MOCK_INTERVENTION_CASE_NOT_FOUND",
    });
  }

  const fromStatus = existing.status;
  let toStatus: GovernanceInterventionStatus = fromStatus;

  if (action === "START") {
    if (isTerminalStatus(fromStatus)) {
      return json(409, {
        ok: false,
        error: "TERMINAL_CASE_CANNOT_START",
        message: "Resolved or cancelled cases must be reopened before action can continue.",
      });
    }

    toStatus = GovernanceInterventionStatus.IN_PROGRESS;
  }

  if (action === "RESOLVE") {
    if (isTerminalStatus(fromStatus)) {
      return json(409, {
        ok: false,
        error: "CASE_ALREADY_TERMINAL",
        message: "This case is already resolved or cancelled.",
      });
    }

    if (note.length < 10) {
      return json(400, {
        ok: false,
        error: "EVIDENCE_NOTE_REQUIRED",
        message: "Add a clear evidence note before resolving this rescue case.",
      });
    }

    toStatus = GovernanceInterventionStatus.RESOLVED;
  }

  if (action === "ESCALATE") {
    if (isTerminalStatus(fromStatus)) {
      return json(409, {
        ok: false,
        error: "TERMINAL_CASE_CANNOT_ESCALATE",
        message: "Resolved or cancelled cases must be reopened before escalation.",
      });
    }

    if (note.length < 10) {
      return json(400, {
        ok: false,
        error: "ESCALATION_REASON_REQUIRED",
        message: "Add a clear reason before escalating this rescue case.",
      });
    }

    toStatus = GovernanceInterventionStatus.ESCALATED;
  }

  if (action === "REOPEN") {
    if (
      fromStatus !== GovernanceInterventionStatus.RESOLVED &&
      fromStatus !== GovernanceInterventionStatus.CANCELLED
    ) {
      return json(409, {
        ok: false,
        error: "ONLY_TERMINAL_CASES_CAN_REOPEN",
        message: "Only resolved or cancelled cases can be reopened.",
      });
    }

    if (note.length < 10) {
      return json(400, {
        ok: false,
        error: "REOPEN_REASON_REQUIRED",
        message: "Add a clear reason before reopening this rescue case.",
      });
    }

    toStatus = GovernanceInterventionStatus.IN_PROGRESS;
  }

  if (action === "CANCEL") {
    if (isTerminalStatus(fromStatus)) {
      return json(409, {
        ok: false,
        error: "CASE_ALREADY_TERMINAL",
        message: "This case is already resolved or cancelled.",
      });
    }

    if (note.length < 10) {
      return json(400, {
        ok: false,
        error: "CANCELLATION_REASON_REQUIRED",
        message: "Add a clear reason before cancelling this rescue case.",
      });
    }

    toStatus = GovernanceInterventionStatus.CANCELLED;
  }

  const finalNote = note || defaultLifecycleNote(action);
  const now = new Date();

  const item = await prisma.$transaction(async (tx) => {
    await tx.governanceInterventionCase.update({
      where: {
        id: existing.id,
      },
      data:
        action === "RESOLVE"
          ? {
              status: toStatus,
              resolvedAt: now,
              resolutionNote: finalNote,
              resolvedBy: {
                connect: { id: ctx.userId },
              },
            }
          : action === "ESCALATE"
            ? {
                status: toStatus,
                escalatedAt: now,
              }
            : action === "REOPEN"
              ? {
                  status: toStatus,
                  resolvedAt: null,
                  resolutionNote: null,
                  cancelledAt: null,
                  cancellationReason: null,
                  resolvedBy: {
                    disconnect: true,
                  },
                  cancelledBy: {
                    disconnect: true,
                  },
                }
              : action === "CANCEL"
                ? {
                    status: toStatus,
                    cancelledAt: now,
                    cancellationReason: finalNote,
                    cancelledBy: {
                      connect: { id: ctx.userId },
                    },
                  }
                : {
                    status: toStatus,
                  },
    });

    await tx.governanceInterventionEvent.create({
      data: {
        caseId: existing.id,
        actorUserId: ctx.userId,
        eventType: lifecycleEventType(action),
        fromStatus,
        toStatus,
        note: finalNote,
        metadata: safeJsonObject({
          source: "HEADTEACHER_MOCK_INTERVENTION_LIFECYCLE",
          action,
          mockSessionId: loaded.session.id,
          mockLabel: loaded.session.mockLabel,
          previousStatus: fromStatus,
          nextStatus: toStatus,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        action: `MOCK_TREND_INTERVENTION_${action}`,
        resource: "GovernanceInterventionCase",
        resourceId: existing.id,
        metadata: safeJsonObject({
          mockSessionId: loaded.session.id,
          caseId: existing.id,
          previousStatus: fromStatus,
          nextStatus: toStatus,
        }),
      },
    });

    return tx.governanceInterventionCase.findUniqueOrThrow({
      where: { id: existing.id },
      select: caseSelect,
    });
  });

  return json(200, {
    ok: true,
    action,
    previousStatus: fromStatus,
    nextStatus: toStatus,
    item: mapCase(item),
  });
}