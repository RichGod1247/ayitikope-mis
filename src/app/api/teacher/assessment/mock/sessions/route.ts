//src/app/api/teacher/assessment/mock/sessions/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { resolveUserClassroomAccess } from "@/lib/teacherAccess";
import {
  cleanMockStr,
  defaultMockTitle,
  isJhs3MockClassroom,
  isValidMockNumber,
  mockLabel,
} from "@/lib/assessments/mock";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UpsertMockSessionSchema = z.object({
  classroomId: z.string().min(1),
  academicYear: z.string().min(1),
  term: z.string().nullable().optional(),
  mockNumber: z.coerce.number().int().min(1).max(12),
  title: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
});

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

function parseOptionalDate(raw: unknown): Date | null | "INVALID_DATE" {
  const s = cleanMockStr(raw);
  if (!s) return null;

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "INVALID_DATE";

  return d;
}

export async function GET(req: NextRequest) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "ADMIN", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const { ctx } = auth;
  const { searchParams } = new URL(req.url);

  const classroomId = cleanMockStr(searchParams.get("classroomId"));
  const academicYear = cleanMockStr(searchParams.get("academicYear")) || "2025/2026";

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

  if (!isJhs3MockClassroom(access.classroom)) {
    return noStore(400, {
      ok: false,
      error: "MOCK_JHS3_ONLY",
      message: "BECE Mock is currently enabled only for JHS 3.",
      classroom: access.classroom,
    });
  }

  const sessions = await prisma.mockExamSession.findMany({
    where: {
      tenantId: ctx.tenantId,
      classroomId,
      academicYear,
    },
    orderBy: [{ mockNumber: "asc" }, { createdAt: "asc" }],
    include: {
      items: {
        where: { type: "MOCK" },
        select: {
          id: true,
          subject: true,
          maxScore: true,
          status: true,
          _count: { select: { scores: true } },
        },
        orderBy: [{ subject: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  return noStore(200, {
    ok: true,
    classroom: access.classroom,
    access: {
      scopeSource: access.scopeSource,
      allowedSubjects: access.allowedSubjects,
    },
    academicYear,
    sessions: sessions.map((session) => {
      const subjects = Array.from(
        new Set(session.items.map((item) => item.subject).filter(Boolean))
      ).sort((a, b) => a.localeCompare(b));

      return {
        id: session.id,
        tenantId: session.tenantId,
        classroomId: session.classroomId,
        academicYear: session.academicYear,
        term: session.term,
        mockNumber: session.mockNumber,
        mockLabel: session.mockLabel,
        title: session.title,
        status: session.status,
        date: session.date ? session.date.toISOString() : null,
        createdByUserId: session.createdByUserId,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        itemCount: session.items.length,
        scoredCellsCount: session.items.reduce(
          (sum, item) => sum + (item._count?.scores ?? 0),
          0
        ),
        subjects,
        items: session.items.map((item) => ({
          id: item.id,
          subject: item.subject,
          maxScore: item.maxScore,
          status: item.status,
          scoresCount: item._count?.scores ?? 0,
        })),
      };
    }),
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
    const data = UpsertMockSessionSchema.parse(raw);

    const classroomId = cleanMockStr(data.classroomId);
    const academicYear = cleanMockStr(data.academicYear);
    const term = cleanMockStr(data.term) || null;
    const mockNumber = Number(data.mockNumber);

    if (!isValidMockNumber(mockNumber)) {
      return noStore(400, { ok: false, error: "INVALID_MOCK_NUMBER" });
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

    if (!isJhs3MockClassroom(access.classroom)) {
      return noStore(400, {
        ok: false,
        error: "MOCK_JHS3_ONLY",
        message: "BECE Mock is currently enabled only for JHS 3.",
        classroom: access.classroom,
      });
    }

    const parsedDate = parseOptionalDate(data.date);
    if (parsedDate === "INVALID_DATE") {
      return noStore(400, { ok: false, error: "INVALID_DATE" });
    }

    const label = mockLabel(mockNumber);
    const title =
      cleanMockStr(data.title) ||
      defaultMockTitle({
        academicYear,
        mockNumber,
      });

    const session = await prisma.mockExamSession.upsert({
      where: {
        tenantId_classroomId_academicYear_mockNumber: {
          tenantId: ctx.tenantId,
          classroomId,
          academicYear,
          mockNumber,
        },
      },
      update: {
        term,
        mockLabel: label,
        title,
        date: parsedDate,
      },
      create: {
        tenantId: ctx.tenantId,
        classroomId,
        academicYear,
        term,
        mockNumber,
        mockLabel: label,
        title,
        date: parsedDate,
        createdByUserId: ctx.userId,
      },
      include: {
        items: {
          where: { type: "MOCK" },
          select: {
            id: true,
            subject: true,
            maxScore: true,
            status: true,
            _count: { select: { scores: true } },
          },
          orderBy: [{ subject: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    return noStore(200, {
      ok: true,
      session: {
        id: session.id,
        tenantId: session.tenantId,
        classroomId: session.classroomId,
        academicYear: session.academicYear,
        term: session.term,
        mockNumber: session.mockNumber,
        mockLabel: session.mockLabel,
        title: session.title,
        status: session.status,
        date: session.date ? session.date.toISOString() : null,
        createdByUserId: session.createdByUserId,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
        itemCount: session.items.length,
        scoredCellsCount: session.items.reduce(
          (sum, item) => sum + (item._count?.scores ?? 0),
          0
        ),
        subjects: Array.from(
          new Set(session.items.map((item) => item.subject).filter(Boolean))
        ).sort((a, b) => a.localeCompare(b)),
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

    console.error("[MOCK_SESSION_UPSERT_ERROR]", err);
    return noStore(500, {
      ok: false,
      error: "FAILED_TO_SAVE_MOCK_SESSION",
    });
  }
}