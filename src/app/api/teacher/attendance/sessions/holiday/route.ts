import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { assertAttendanceDateInCurrentTerm } from "@/lib/server/attendanceAcademicCalendar";
import {
  requireTenantContext,
  assertTenantParamMatches,
  toHttpError,
} from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    sessionId: z.string().trim().min(1, "sessionId is required."),
    reason: z
      .string()
      .trim()
      .min(4, "A clear holiday reason is required.")
      .max(500, "Holiday reason is too long."),
    confirmCertifiedSupersession: z.boolean().optional(),
    tenantId: z.string().optional(), // legacy compatibility only
  })
  .strict();

const PRE_CERT_HOLIDAY_ROLES = new Set([
  "TEACHER",
  "SCHOOL_ADMIN",
  "HEADTEACHER",
  "SUPERADMIN",
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "OWNER",
]);

const CERTIFIED_SUPERSESSION_ROLES = new Set([
  "SCHOOL_ADMIN",
  "HEADTEACHER",
  "SUPERADMIN",
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "OWNER",
]);

function noStoreJson(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function normalizeRoleName(value: unknown) {
  const role = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (role === "ADMIN") return "SCHOOL_ADMIN";
  if (role === "HEADMASTER") return "HEADTEACHER";
  return role;
}

function canDeclareBeforeCertification(roleName: unknown) {
  return PRE_CERT_HOLIDAY_ROLES.has(normalizeRoleName(roleName));
}

function canSupersedeCertified(roleName: unknown) {
  return CERTIFIED_SUPERSESSION_ROLES.has(normalizeRoleName(roleName));
}

function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  );
}

function userAgent(req: Request) {
  return req.headers.get("user-agent") || null;
}

function isoOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

type LockedSessionRow = {
  id: string;
  tenantId: string;
  classroomId: string;
  date: Date;
  takenByUserId: string | null;
  isClosed: boolean;
  closedAt: Date | null;
  certifiedAt: Date | null;
  certifiedByUserId: string | null;
  notifyingAt: Date | null;
  notifiedAt: Date | null;
  isHoliday: boolean;
  holidayReason: string | null;
  holidayDeclaredAt: Date | null;
  holidayDeclaredByUserId: string | null;
};

function toApiSession(row: LockedSessionRow) {
  const dateISO = row.date.toISOString().slice(0, 10);

  return {
    id: row.id,
    tenantId: row.tenantId,
    classroomId: row.classroomId,
    date: dateISO,
    dateISO,
    takenByUserId: row.takenByUserId,
    isClosed: row.isClosed,
    closedAt: isoOrNull(row.closedAt),
    certifiedAt: isoOrNull(row.certifiedAt),
    certifiedByUserId: row.certifiedByUserId,
    isHoliday: row.isHoliday,
    holidayReason: row.holidayReason,
    holidayDeclaredAt: isoOrNull(row.holidayDeclaredAt),
    holidayDeclaredByUserId: row.holidayDeclaredByUserId,
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

    const { sessionId, reason, confirmCertifiedSupersession, tenantId: tenantIdParam } =
      parsed.data;

    assertTenantParamMatches(safe.tenantId, tenantIdParam?.trim() || null);

    const [membership, preflight] = await Promise.all([
      prisma.membership.findFirst({
        where: {
          tenantId: safe.tenantId,
          userId: safe.userId,
          status: "ACTIVE",
        },
        select: { role: { select: { name: true } } },
      }),
      prisma.attendanceSession.findFirst({
        where: {
          id: sessionId,
          tenantId: safe.tenantId,
        },
        select: {
          id: true,
          classroomId: true,
          date: true,
        },
      }),
    ]);

    if (!membership) {
      return noStoreJson(403, { ok: false, error: "Forbidden." });
    }

    if (!preflight) {
      return noStoreJson(404, { ok: false, error: "Session not found." });
    }

    await assertCanAccessClassroom({
      ...safe,
      classroomId: preflight.classroomId,
    });

    await assertAttendanceDateInCurrentTerm({
      tenantId: safe.tenantId,
      date: preflight.date,
    });

    const roleName = normalizeRoleName(membership.role?.name);
    const certifiedCorrectionAuthorized = canSupersedeCertified(roleName);
    const now = new Date();

    const result = await prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<LockedSessionRow[]>(Prisma.sql`
          SELECT
            s."id",
            s."tenantId",
            s."classroomId",
            s."date",
            s."takenByUserId",
            s."isClosed",
            s."closedAt",
            s."certifiedAt",
            s."certifiedByUserId",
            s."notifyingAt",
            s."notifiedAt",
            s."isHoliday",
            s."holidayReason",
            s."holidayDeclaredAt",
            s."holidayDeclaredByUserId"
          FROM "edulife_os"."AttendanceSession" s
          WHERE s."id" = ${sessionId}
            AND s."tenantId" = ${safe.tenantId}
          FOR UPDATE
        `);

        const session = locked[0];
        if (!session) {
          return { kind: "error" as const, status: 404, error: "Session not found." };
        }

        if (session.isHoliday) {
          return {
            kind: "ok" as const,
            alreadyHoliday: true,
            supersededCertifiedAttendance: !!session.certifiedAt,
            session,
          };
        }

        if (session.notifyingAt) {
          return {
            kind: "error" as const,
            status: 409,
            error: "Attendance notification is currently in progress. Wait for it to finish, then retry the holiday correction.",
          };
        }

        const isCertified = !!session.certifiedAt;
        const adminLike = certifiedCorrectionAuthorized;

        if (!canDeclareBeforeCertification(roleName)) {
          return {
            kind: "error" as const,
            status: 403,
            error: "Only the assigned teacher, Headteacher or authorized school administrator can declare or request a holiday for attendance.",
          };
        }

        if (
          !adminLike &&
          session.takenByUserId &&
          session.takenByUserId !== safe.userId
        ) {
          return {
            kind: "error" as const,
            status: 403,
            error: "This session is owned by another user.",
          };
        }

        const markCount = await tx.attendanceMark.count({
          where: { sessionId: session.id },
        });

        const teacherNeedsApproval =
          !adminLike && (isCertified || markCount > 0);

        if (teacherNeedsApproval) {
          const latestRequestEvent = await tx.auditLog.findFirst({
            where: {
              tenantId: safe.tenantId,
              resource: "AttendanceSession",
              resourceId: session.id,
              action: {
                in: [
                  "ATTENDANCE_HOLIDAY_REQUESTED",
                  "ATTENDANCE_HOLIDAY_REQUEST_APPROVED",
                  "ATTENDANCE_HOLIDAY_REQUEST_REJECTED",
                ],
              },
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              action: true,
              createdAt: true,
              metadata: true,
            },
          });

          if (latestRequestEvent?.action === "ATTENDANCE_HOLIDAY_REQUESTED") {
            return {
              kind: "pending" as const,
              alreadyPending: true,
              requestId: latestRequestEvent.id,
              requestedAt: latestRequestEvent.createdAt,
              reason,
              session,
            };
          }

          const requestEvent = await tx.auditLog.create({
            data: {
              tenantId: safe.tenantId,
              userId: safe.userId,
              action: "ATTENDANCE_HOLIDAY_REQUESTED",
              resource: "AttendanceSession",
              resourceId: session.id,
              ip: clientIp(req) ?? undefined,
              userAgent: userAgent(req) ?? undefined,
              metadata: {
                reason,
                roleName,
                classroomId: session.classroomId,
                dateISO: session.date.toISOString().slice(0, 10),
                markedLearners: markCount,
                certifiedAt: isoOrNull(session.certifiedAt),
                existingAttendancePreserved: true,
                requiresHeadteacherApproval: true,
              } satisfies Prisma.JsonObject,
            },
            select: {
              id: true,
              createdAt: true,
            },
          });

          return {
            kind: "pending" as const,
            alreadyPending: false,
            requestId: requestEvent.id,
            requestedAt: requestEvent.createdAt,
            reason,
            session,
          };
        }

        if (isCertified) {
          if (confirmCertifiedSupersession !== true) {
            return {
              kind: "error" as const,
              status: 400,
              error: "Certified holiday correction requires explicit confirmation.",
            };
          }
        } else if (markCount > 0) {
          return {
            kind: "error" as const,
            status: 409,
            error: "Attendance evidence exists. Use Headteacher Attendance Command to reconcile this class to Holiday.",
          };
        }

        const updatedCount = await tx.attendanceSession.updateMany({
          where: {
            id: session.id,
            tenantId: safe.tenantId,
            isHoliday: false,
            ...(isCertified ? { certifiedAt: { not: null } } : { certifiedAt: null }),
          },
          data: {
            isHoliday: true,
            holidayReason: reason,
            holidayDeclaredAt: now,
            holidayDeclaredByUserId: safe.userId,
          },
        });

        if (updatedCount.count !== 1) {
          return {
            kind: "error" as const,
            status: 409,
            error: "Unable to save the holiday due to a concurrent update. Retry.",
          };
        }

        await tx.auditLog.create({
          data: {
            tenantId: safe.tenantId,
            userId: safe.userId,
            action: isCertified
              ? "ATTENDANCE_CERTIFIED_DAY_SUPERSEDED_AS_HOLIDAY"
              : "ATTENDANCE_HOLIDAY_DECLARED",
            resource: "AttendanceSession",
            resourceId: session.id,
            ip: clientIp(req) ?? undefined,
            userAgent: userAgent(req) ?? undefined,
            metadata: {
              reason,
              roleName,
              classroomId: session.classroomId,
              dateISO: session.date.toISOString().slice(0, 10),
              supersededCertifiedAttendance: isCertified,
              originalEvidencePreserved: true,
              previous: {
                isClosed: session.isClosed,
                closedAt: isoOrNull(session.closedAt),
                certifiedAt: isoOrNull(session.certifiedAt),
                certifiedByUserId: session.certifiedByUserId,
                notifiedAt: isoOrNull(session.notifiedAt),
              },
            } satisfies Prisma.JsonObject,
          },
        });

        const updatedRows = await tx.$queryRaw<LockedSessionRow[]>(Prisma.sql`
          SELECT
            s."id",
            s."tenantId",
            s."classroomId",
            s."date",
            s."takenByUserId",
            s."isClosed",
            s."closedAt",
            s."certifiedAt",
            s."certifiedByUserId",
            s."notifyingAt",
            s."notifiedAt",
            s."isHoliday",
            s."holidayReason",
            s."holidayDeclaredAt",
            s."holidayDeclaredByUserId"
          FROM "edulife_os"."AttendanceSession" s
          WHERE s."id" = ${session.id}
            AND s."tenantId" = ${safe.tenantId}
        `);

        const updated = updatedRows[0];
        if (!updated) {
          return {
            kind: "error" as const,
            status: 404,
            error: "Session not found after holiday update.",
          };
        }

        return {
          kind: "ok" as const,
          alreadyHoliday: false,
          supersededCertifiedAttendance: isCertified,
          session: updated,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    if (result.kind === "error") {
      return noStoreJson(result.status, { ok: false, error: result.error });
    }

    if (result.kind === "pending") {
      return noStoreJson(202, {
        ok: true,
        pendingApproval: true,
        alreadyPending: result.alreadyPending,
        requestId: result.requestId,
        requestedAt: result.requestedAt.toISOString(),
        reason: result.reason,
        officialAttendanceExcluded: false,
        notificationExcluded: false,
        session: toApiSession(result.session),
      });
    }

    return noStoreJson(200, {
      ok: true,
      pendingApproval: false,
      alreadyHoliday: result.alreadyHoliday,
      supersededCertifiedAttendance: result.supersededCertifiedAttendance,
      officialAttendanceExcluded: true,
      notificationExcluded: true,
      session: toApiSession(result.session),
    });
  } catch (error: unknown) {
    if (String((error as { code?: unknown })?.code ?? "") === "P2034") {
      return noStoreJson(409, {
        ok: false,
        error: "Attendance changed at the same time. Retry the holiday action.",
      });
    }

    const { status, msg } = toHttpError(error);
    return noStoreJson(status, { ok: false, error: msg });
  }
}
