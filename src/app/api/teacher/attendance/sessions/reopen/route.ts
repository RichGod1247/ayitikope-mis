// src/app/api/teacher/attendance/sessions/reopen/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { assertAttendanceDateInCurrentTerm } from "@/lib/server/attendanceAcademicCalendar";
import { writeAuditLog } from "@/lib/audit";
import {
  requireTenantContext,
  assertTenantParamMatches,
  toHttpError,
} from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    sessionId: z.string().min(1, "sessionId is required."),
    reason: z
      .string()
      .trim()
      .min(8, "A clear reopen reason is required.")
      .max(500, "Reopen reason is too long."),
    tenantId: z.string().optional(), // legacy compatibility only
  })
  .strict();

const sessionSelect = {
  id: true,
  tenantId: true,
  classroomId: true,
  date: true,
  isClosed: true,
  closedAt: true,
  certifiedAt: true,
  certifiedByUserId: true,
  takenByUserId: true,
  isHoliday: true,
  holidayReason: true,
  holidayDeclaredAt: true,
  holidayDeclaredByUserId: true,
  classroom: { select: { name: true, grade: true, arm: true } },
} satisfies Prisma.AttendanceSessionSelect;

type SessionRow = Prisma.AttendanceSessionGetPayload<{ select: typeof sessionSelect }>;

function noStoreJson(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isoOrNull(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

function userAgent(req: Request) {
  return req.headers.get("user-agent") || null;
}

function isAdminLike(roleName: string | null | undefined) {
  const r = String(roleName ?? "").toUpperCase();
  return r.includes("ADMIN") || r.includes("HEAD") || r.includes("OWNER") || r === "SUPERADMIN";
}

async function loadActiveRoleName(userId: string, tenantId: string) {
  const membership = await prisma.membership.findFirst({
    where: { tenantId, userId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });

  if (!membership) {
    const err = new Error("FORBIDDEN");
    (err as { status?: number }).status = 403;
    throw err;
  }

  return membership.role?.name ?? null;
}

function toApiSession(session: SessionRow) {
  const d = isoDateOnly(session.date);

  return {
    id: session.id,
    tenantId: session.tenantId,
    classroomId: session.classroomId,
    classroomName: session.classroom?.name ?? "",
    classroomGrade: session.classroom?.grade ?? null,
    classroomArm: session.classroom?.arm ?? null,
    date: d,
    dateISO: d,
    takenByUserId: session.takenByUserId ?? null,
    isClosed: session.isClosed,
    closedAt: isoOrNull(session.closedAt),
    certifiedAt: isoOrNull(session.certifiedAt),
    certifiedByUserId: session.certifiedByUserId ?? null,
    isHoliday: session.isHoliday,
    holidayReason: session.holidayReason ?? null,
    holidayDeclaredAt: isoOrNull(session.holidayDeclaredAt),
    holidayDeclaredByUserId: session.holidayDeclaredByUserId ?? null,
  };
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const safe = { userId: ctx.userId, tenantId: ctx.tenantId };

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);

    if (!parsed.success) {
      return noStoreJson(400, {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid request body.",
      });
    }

    const { sessionId, reason, tenantId: tenantIdParam } = parsed.data;

    const suppliedTenantId = tenantIdParam?.trim() || null;
    assertTenantParamMatches(safe.tenantId, suppliedTenantId);

    const [roleName, session] = await Promise.all([
      loadActiveRoleName(safe.userId, safe.tenantId),
      prisma.attendanceSession.findFirst({
        where: {
          id: sessionId.trim(),
          tenantId: safe.tenantId,
        },
        select: sessionSelect,
      }),
    ]);

    if (!session) {
      return noStoreJson(404, { ok: false, error: "Session not found." });
    }

    await assertCanAccessClassroom({
      ...safe,
      classroomId: session.classroomId,
    });
    await assertAttendanceDateInCurrentTerm({
      tenantId: safe.tenantId,
      date: session.date,
    });

    if (session.isHoliday) {
      return noStoreJson(409, {
        ok: false,
        error: "Holiday sessions cannot be reopened for learner marks.",
      });
    }

    if (session.certifiedAt) {
      return noStoreJson(409, {
        ok: false,
        error: "Certified sessions cannot be reopened.",
      });
    }

    if (!session.isClosed) {
      return noStoreJson(409, {
        ok: false,
        error: "Session is already open.",
      });
    }

    const adminLike = isAdminLike(roleName);

    if (!adminLike && session.takenByUserId && session.takenByUserId !== safe.userId) {
      return noStoreJson(403, {
        ok: false,
        error: "This session is owned by another user.",
      });
    }

    const update = await prisma.attendanceSession.updateMany({
      where: {
        id: session.id,
        tenantId: safe.tenantId,
        certifiedAt: null,
        isHoliday: false,
        isClosed: true,
        ...(adminLike
          ? {}
          : {
              OR: [{ takenByUserId: null }, { takenByUserId: safe.userId }],
            }),
      },
      data: {
        isClosed: false,
        closedAt: null,
        takenByUserId: session.takenByUserId ?? safe.userId,
      },
    });

    if (update.count !== 1) {
      return noStoreJson(409, {
        ok: false,
        error: "Unable to reopen due to a concurrent update. Retry.",
      });
    }

    await writeAuditLog({
      action: "ATTENDANCE_SESSION_REOPENED",
      tenantId: safe.tenantId,
      userId: safe.userId,
      resource: "AttendanceSession",
      resourceId: session.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      metadata: {
        reason,
        classroomId: session.classroomId,
        classroomName: session.classroom?.name ?? null,
        dateISO: isoDateOnly(session.date),
        previous: {
          isClosed: session.isClosed,
          closedAt: isoOrNull(session.closedAt),
          certifiedAt: isoOrNull(session.certifiedAt),
          takenByUserId: session.takenByUserId ?? null,
        },
        actor: {
          roleName,
          adminLike,
        },
      },
    });

    const updated = await prisma.attendanceSession.findFirst({
      where: {
        id: session.id,
        tenantId: safe.tenantId,
      },
      select: sessionSelect,
    });

    if (!updated) {
      return noStoreJson(404, { ok: false, error: "Session not found after reopen." });
    }

    return noStoreJson(200, {
      ok: true,
      session: toApiSession(updated),
    });
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return noStoreJson(status, { ok: false, error: msg });
  }
}