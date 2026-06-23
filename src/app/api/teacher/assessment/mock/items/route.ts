//src/app/api/teacher/assessment/mock/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import {
  isAdminLikeRole,
  resolveUserClassroomAccess,
} from "@/lib/teacherAccess";
import {
  cleanMockStr,
  isJhs3MockClassroom,
  MOCK_MAX_SCORE,
  normalizeMockKey,
} from "@/lib/assessments/mock";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MockItemSchema = z.object({
  sessionId: z.string().min(1),
  subject: z.string().min(1),
});

type MockSessionForRoute = {
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

function subjectWhereForRole(args: {
  roleName: string | null;
  allowedSubjects: string[] | null;
}) {
  if (isAdminLikeRole(args.roleName)) return {};

  const allowed = Array.isArray(args.allowedSubjects)
    ? args.allowedSubjects.map(cleanMockStr).filter(Boolean)
    : [];

  if (!allowed.length) {
    return {
      id: "__NO_ACCESS_TO_MOCK_SUBJECT_ITEMS__",
    };
  }

  return {
    OR: allowed.map((subject) => ({
      subject: { equals: subject, mode: "insensitive" as const },
    })),
  };
}

function mockItemTitle(session: MockSessionForRoute, subject: string) {
  return `${session.mockLabel} - ${subject}`;
}

function mapMockItem(item: {
  id: string;
  classroomId: string;
  subject: string;
  term: string;
  academicYear: string;
  title: string;
  description: string | null;
  type: string;
  maxScore: number;
  weighting: number | null;
  date: Date | null;
  status: string;
  publishedAt: Date | null;
  lockedAt: Date | null;
  mockExamSessionId: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { scores: number };
}) {
  return {
    id: item.id,
    classroomId: item.classroomId,
    subject: item.subject,
    term: item.term,
    academicYear: item.academicYear,
    title: item.title,
    description: item.description,
    type: item.type,
    maxScore: item.maxScore,
    weighting: item.weighting,
    date: item.date ? item.date.toISOString() : null,
    status: item.status,
    publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
    lockedAt: item.lockedAt ? item.lockedAt.toISOString() : null,
    mockExamSessionId: item.mockExamSessionId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    scoresCount: item._count?.scores ?? 0,
  };
}

async function getMockSession(sessionId: string, tenantId: string) {
  return prisma.mockExamSession.findFirst({
    where: {
      id: sessionId,
      tenantId,
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
  });
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const sessionId = cleanMockStr(searchParams.get("sessionId"));

  if (!sessionId) {
    return noStore(400, { ok: false, error: "MISSING_SESSION_ID" });
  }

  const session = await getMockSession(sessionId, ctx.tenantId);

  if (!session) {
    return noStore(404, { ok: false, error: "MOCK_SESSION_NOT_FOUND" });
  }

  const access = await resolveUserClassroomAccess({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    roleName: ctx.roleName,
    classroomId: session.classroomId,
  });

  if (!access.ok) {
    return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
      ok: false,
      error: access.reason,
    });
  }

  if (!isJhs3MockClassroom(session.classroom)) {
    return noStore(400, {
      ok: false,
      error: "MOCK_JHS3_ONLY",
      message: "BECE Mock is currently enabled only for JHS 3.",
      classroom: session.classroom,
    });
  }

  const items = await prisma.assessmentItem.findMany({
    where: {
      tenantId: ctx.tenantId,
      classroomId: session.classroomId,
      academicYear: session.academicYear,
      mockExamSessionId: session.id,
      type: "MOCK",
      ...subjectWhereForRole({
        roleName: ctx.roleName,
        allowedSubjects: access.allowedSubjects,
      }),
    } as const,
    orderBy: [{ subject: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      classroomId: true,
      subject: true,
      term: true,
      academicYear: true,
      title: true,
      description: true,
      type: true,
      maxScore: true,
      weighting: true,
      date: true,
      status: true,
      publishedAt: true,
      lockedAt: true,
      mockExamSessionId: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          scores: true,
        },
      },
    },
  });

  return noStore(200, {
    ok: true,
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
    classroom: session.classroom,
    access: {
      scopeSource: access.scopeSource,
      allowedSubjects: access.allowedSubjects,
    },
    items: items.map(mapMockItem),
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
    const data = MockItemSchema.parse(raw);

    const sessionId = cleanMockStr(data.sessionId);
    const subject = cleanMockStr(data.subject);

    if (!subject) {
      return noStore(400, { ok: false, error: "MISSING_SUBJECT" });
    }

    const session = await getMockSession(sessionId, ctx.tenantId);

    if (!session) {
      return noStore(404, { ok: false, error: "MOCK_SESSION_NOT_FOUND" });
    }

    if (!isJhs3MockClassroom(session.classroom)) {
      return noStore(400, {
        ok: false,
        error: "MOCK_JHS3_ONLY",
        message: "BECE Mock is currently enabled only for JHS 3.",
        classroom: session.classroom,
      });
    }

    if (session.status !== "OPEN") {
      return noStore(409, {
        ok: false,
        error: "MOCK_SESSION_NOT_OPEN",
        status: session.status,
      });
    }

    const access = await resolveUserClassroomAccess({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      roleName: ctx.roleName,
      classroomId: session.classroomId,
      subject,
    });

    if (!access.ok) {
      return noStore(isForbiddenReason(access.reason) ? 403 : 404, {
        ok: false,
        error: access.reason,
      });
    }

    const existingItems = await prisma.assessmentItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        classroomId: session.classroomId,
        academicYear: session.academicYear,
        mockExamSessionId: session.id,
        type: "MOCK",
        subject: { equals: subject, mode: "insensitive" },
      },
      orderBy: [{ createdAt: "asc" }],
      take: 2,
      select: {
        id: true,
        classroomId: true,
        subject: true,
        term: true,
        academicYear: true,
        title: true,
        description: true,
        type: true,
        maxScore: true,
        weighting: true,
        date: true,
        status: true,
        publishedAt: true,
        lockedAt: true,
        mockExamSessionId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            scores: true,
          },
        },
      },
    });

    if (existingItems.length > 1) {
      return noStore(409, {
        ok: false,
        error: "DUPLICATE_MOCK_SUBJECT_ITEM",
        message: "More than one mock item exists for this session and subject.",
        itemIds: existingItems.map((item) => item.id),
      });
    }

    if (existingItems.length === 1) {
      const existing = existingItems[0];

      const needsRepair =
        existing.maxScore !== MOCK_MAX_SCORE ||
        existing.term !== (session.term ?? "Mock") ||
        existing.academicYear !== session.academicYear ||
        existing.title !== mockItemTitle(session, existing.subject) ||
        existing.mockExamSessionId !== session.id;

      if (!needsRepair) {
        return noStore(200, {
          ok: true,
          created: false,
          item: mapMockItem(existing),
          session: {
            id: session.id,
            mockNumber: session.mockNumber,
            mockLabel: session.mockLabel,
            title: session.title,
          },
        });
      }

      const repaired = await prisma.assessmentItem.update({
        where: { id: existing.id },
        data: {
          term: session.term ?? "Mock",
          academicYear: session.academicYear,
          title: mockItemTitle(session, existing.subject),
          description: `${session.title} score entry for ${existing.subject}`,
          type: "MOCK",
          maxScore: MOCK_MAX_SCORE,
          weighting: null,
          date: session.date,
          componentCode: "MOCK",
          templateKey: `MOCK:${session.id}:${normalizeMockKey(existing.subject)}`,
          sortOrder: session.mockNumber,
          isRequired: true,
          mockExamSessionId: session.id,
        },
        select: {
          id: true,
          classroomId: true,
          subject: true,
          term: true,
          academicYear: true,
          title: true,
          description: true,
          type: true,
          maxScore: true,
          weighting: true,
          date: true,
          status: true,
          publishedAt: true,
          lockedAt: true,
          mockExamSessionId: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              scores: true,
            },
          },
        },
      });

      return noStore(200, {
        ok: true,
        created: false,
        repaired: true,
        item: mapMockItem(repaired),
        session: {
          id: session.id,
          mockNumber: session.mockNumber,
          mockLabel: session.mockLabel,
          title: session.title,
        },
      });
    }

    const created = await prisma.assessmentItem.create({
      data: {
        tenantId: ctx.tenantId,
        classroomId: session.classroomId,
        subject,
        term: session.term ?? "Mock",
        academicYear: session.academicYear,
        title: mockItemTitle(session, subject),
        description: `${session.title} score entry for ${subject}`,
        type: "MOCK",
        maxScore: MOCK_MAX_SCORE,
        weighting: null,
        date: session.date,
        componentCode: "MOCK",
        templateKey: `MOCK:${session.id}:${normalizeMockKey(subject)}`,
        sortOrder: session.mockNumber,
        isRequired: true,
        mockExamSessionId: session.id,
        createdByUserId: ctx.userId,
      },
      select: {
        id: true,
        classroomId: true,
        subject: true,
        term: true,
        academicYear: true,
        title: true,
        description: true,
        type: true,
        maxScore: true,
        weighting: true,
        date: true,
        status: true,
        publishedAt: true,
        lockedAt: true,
        mockExamSessionId: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            scores: true,
          },
        },
      },
    });

    return noStore(201, {
      ok: true,
      created: true,
      item: mapMockItem(created),
      session: {
        id: session.id,
        mockNumber: session.mockNumber,
        mockLabel: session.mockLabel,
        title: session.title,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return noStore(400, {
        ok: false,
        error: "INVALID_DATA",
        details: err.flatten(),
      });
    }

    console.error("[MOCK_ITEM_UPSERT_ERROR]", err);
    return noStore(500, {
      ok: false,
      error: "FAILED_TO_SAVE_MOCK_ITEM",
    });
  }
}