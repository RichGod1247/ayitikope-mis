import { NextResponse } from "next/server";
import { ClassroomStatus, Prisma, StudentStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getHeadteacherApiContext } from "@/lib/headteacherAuth";
import { assertAttendanceDateInCurrentTerm } from "@/lib/server/attendanceAcademicCalendar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("DECLARE_DAY"),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().trim().min(4).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("APPROVE_REQUEST"),
      sessionId: z.string().trim().min(1),
      decisionReason: z.string().trim().min(4).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("REJECT_REQUEST"),
      sessionId: z.string().trim().min(1),
      decisionReason: z.string().trim().min(4).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("REOPEN_CLASS"),
      sessionId: z.string().trim().min(1),
      reason: z.string().trim().min(8).max(500),
    })
    .strict(),
]);

const REQUEST_ACTIONS = [
  "ATTENDANCE_HOLIDAY_REQUESTED",
  "ATTENDANCE_HOLIDAY_REQUEST_APPROVED",
  "ATTENDANCE_HOLIDAY_REQUEST_REJECTED",
] as const;

type LockedSession = {
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

class RouteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function noStoreJson(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
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

function dateFromISO(dateISO: string) {
  return new Date(`${dateISO}T00:00:00.000Z`);
}

function isoOrNull(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function metadataString(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value = (metadata as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeRole(value: unknown) {
  const role = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");

  if (role === "ADMIN") return "SCHOOL_ADMIN";
  if (role === "HEADMASTER") return "HEADTEACHER";
  return role;
}

function classLabel(classroom: {
  name?: string | null;
  grade?: string | null;
  arm?: string | null;
}) {
  const name = String(classroom.name ?? "").trim();
  if (name) return name;

  return [classroom.grade, classroom.arm].filter(Boolean).join(" ").trim() || "Class";
}

async function lockSession(
  tx: Prisma.TransactionClient,
  tenantId: string,
  sessionId: string,
) {
  const rows = await tx.$queryRaw<LockedSession[]>(Prisma.sql`
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
      AND s."tenantId" = ${tenantId}
    FOR UPDATE
  `);

  const session = rows[0];
  if (!session) throw new RouteError(404, "Attendance session not found.");
  return session;
}

async function latestHolidayRequest(
  tx: Prisma.TransactionClient,
  tenantId: string,
  sessionId: string,
) {
  return tx.auditLog.findFirst({
    where: {
      tenantId,
      resource: "AttendanceSession",
      resourceId: sessionId,
      action: { in: [...REQUEST_ACTIONS] },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      userId: true,
      action: true,
      createdAt: true,
      metadata: true,
      user: {
        select: {
          name: true,
          firstName: true,
          lastName: true,
        },
      },
    },
  });
}

async function snapshotPreCertMarks(
  tx: Prisma.TransactionClient,
  sessionId: string,
) {
  const marks = await tx.attendanceMark.findMany({
    where: { sessionId },
    orderBy: [{ studentId: "asc" }],
    select: {
      id: true,
      studentId: true,
      status: true,
      note: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return marks.map((mark) => ({
    id: mark.id,
    studentId: mark.studentId,
    status: mark.status,
    note: mark.note ?? null,
    createdAt: mark.createdAt.toISOString(),
    updatedAt: mark.updatedAt.toISOString(),
  }));
}

async function applyHoliday({
  tx,
  req,
  tenantId,
  actorUserId,
  session,
  reason,
  action,
  extraMetadata,
}: {
  tx: Prisma.TransactionClient;
  req: Request;
  tenantId: string;
  actorUserId: string;
  session: LockedSession;
  reason: string;
  action: string;
  extraMetadata?: Prisma.InputJsonObject;
}) {
  if (session.isHoliday) {
    return {
      alreadyHoliday: true,
      reconciledMarks: 0,
      certifiedEvidencePreserved: !!session.certifiedAt,
    };
  }

  if (session.notifyingAt) {
    throw new RouteError(
      409,
      "Attendance notification is currently in progress for this class. Wait for it to finish, then retry.",
    );
  }

  const markSnapshot = session.certifiedAt
    ? []
    : await snapshotPreCertMarks(tx, session.id);

  if (!session.certifiedAt && markSnapshot.length > 0) {
    await tx.attendanceMark.deleteMany({
      where: { sessionId: session.id },
    });
  }

  const now = new Date();

  const updated = await tx.attendanceSession.updateMany({
    where: {
      id: session.id,
      tenantId,
      isHoliday: false,
    },
    data: {
      isHoliday: true,
      holidayReason: reason,
      holidayDeclaredAt: now,
      holidayDeclaredByUserId: actorUserId,
    },
  });

  if (updated.count !== 1) {
    throw new RouteError(
      409,
      "Attendance changed at the same time. Refresh and retry the holiday action.",
    );
  }

  await tx.auditLog.create({
    data: {
      tenantId,
      userId: actorUserId,
      action,
      resource: "AttendanceSession",
      resourceId: session.id,
      ip: clientIp(req) ?? undefined,
      userAgent: userAgent(req) ?? undefined,
      metadata: {
        reason,
        classroomId: session.classroomId,
        dateISO: session.date.toISOString().slice(0, 10),
        originalEvidencePreserved: true,
        certifiedEvidencePreserved: !!session.certifiedAt,
        preCertificationMarksReconciled: markSnapshot.length,
        ...(markSnapshot.length > 0
          ? {
              reconciledMarkSnapshot: markSnapshot,
            }
          : {}),
        previous: {
          isClosed: session.isClosed,
          closedAt: isoOrNull(session.closedAt),
          certifiedAt: isoOrNull(session.certifiedAt),
          certifiedByUserId: session.certifiedByUserId,
          notifiedAt: isoOrNull(session.notifiedAt),
          isHoliday: session.isHoliday,
          holidayReason: session.holidayReason,
          holidayDeclaredAt: isoOrNull(session.holidayDeclaredAt),
          holidayDeclaredByUserId: session.holidayDeclaredByUserId,
        },
        ...(extraMetadata ?? {}),
      } satisfies Prisma.InputJsonObject,
    },
  });

  return {
    alreadyHoliday: false,
    reconciledMarks: markSnapshot.length,
    certifiedEvidencePreserved: !!session.certifiedAt,
  };
}

export async function POST(req: Request) {
  const ctx = await getHeadteacherApiContext();

  if (!ctx) {
    return noStoreJson(401, { ok: false, error: "Unauthorized." });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));

  if (!parsed.success) {
    return noStoreJson(400, {
      ok: false,
      error: parsed.error.issues[0]?.message || "Invalid holiday action.",
    });
  }

  const safe = {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
  };

  try {
    if (parsed.data.action === "DECLARE_DAY") {
      const { date: dateISO, reason } = parsed.data;
      const date = dateFromISO(dateISO);

      await assertAttendanceDateInCurrentTerm({
        tenantId: safe.tenantId,
        date,
      });

      const [classrooms, activeStudentCounts] = await Promise.all([
        prisma.classroom.findMany({
          where: {
            tenantId: safe.tenantId,
            status: ClassroomStatus.ACTIVE,
          },
          orderBy: [{ grade: "asc" }, { arm: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            grade: true,
            arm: true,
          },
        }),
        prisma.student.groupBy({
          by: ["classroomId"],
          where: {
            tenantId: safe.tenantId,
            status: StudentStatus.ACTIVE,
            classroomId: { not: null },
          },
          _count: { _all: true },
        }),
      ]);

      const activeByClass = new Map(
        activeStudentCounts
          .filter((row) => !!row.classroomId)
          .map((row) => [row.classroomId as string, row._count._all]),
      );

      const existingSessions = await prisma.attendanceSession.findMany({
        where: {
          tenantId: safe.tenantId,
          date,
        },
        select: {
          id: true,
          classroomId: true,
        },
      });

      const existingClassIds = new Set(
        existingSessions.map((session) => session.classroomId),
      );

      const operational = classrooms.filter(
        (classroom) =>
          (activeByClass.get(classroom.id) ?? 0) > 0 ||
          existingClassIds.has(classroom.id),
      );

      const result = await prisma.$transaction(
        async (tx) => {
          let declared = 0;
          let alreadyHoliday = 0;
          let createdHolidaySessions = 0;
          let reconciledMarks = 0;
          let certifiedEvidencePreserved = 0;
          let requestsResolved = 0;

          const affected: Array<{
            classroomId: string;
            classLabel: string;
            outcome: "DECLARED" | "ALREADY_HOLIDAY";
          }> = [];

          for (const classroom of operational) {
            const rows = await tx.$queryRaw<LockedSession[]>(Prisma.sql`
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
              WHERE s."tenantId" = ${safe.tenantId}
                AND s."classroomId" = ${classroom.id}
                AND s."date" = ${date}
              FOR UPDATE
            `);

            const session = rows[0] ?? null;

            if (!session) {
              const now = new Date();
              const created = await tx.attendanceSession.create({
                data: {
                  tenantId: safe.tenantId,
                  classroomId: classroom.id,
                  date,
                  isHoliday: true,
                  holidayReason: reason,
                  holidayDeclaredAt: now,
                  holidayDeclaredByUserId: safe.userId,
                },
                select: {
                  id: true,
                },
              });

              await tx.auditLog.create({
                data: {
                  tenantId: safe.tenantId,
                  userId: safe.userId,
                  action: "ATTENDANCE_SCHOOL_DAY_CLASS_HOLIDAY_DECLARED",
                  resource: "AttendanceSession",
                  resourceId: created.id,
                  ip: clientIp(req) ?? undefined,
                  userAgent: userAgent(req) ?? undefined,
                  metadata: {
                    reason,
                    classroomId: classroom.id,
                    classLabel: classLabel(classroom),
                    dateISO,
                    createdHolidaySession: true,
                    originalEvidencePreserved: true,
                  } satisfies Prisma.InputJsonObject,
                },
              });

              declared += 1;
              createdHolidaySessions += 1;
              affected.push({
                classroomId: classroom.id,
                classLabel: classLabel(classroom),
                outcome: "DECLARED",
              });
              continue;
            }

            if (session.isHoliday) {
              alreadyHoliday += 1;
              affected.push({
                classroomId: classroom.id,
                classLabel: classLabel(classroom),
                outcome: "ALREADY_HOLIDAY",
              });
              continue;
            }

            const pending = await latestHolidayRequest(
              tx,
              safe.tenantId,
              session.id,
            );

            const pendingRequest =
              pending?.action === "ATTENDANCE_HOLIDAY_REQUESTED"
                ? pending
                : null;

            const applied = await applyHoliday({
              tx,
              req,
              tenantId: safe.tenantId,
              actorUserId: safe.userId,
              session,
              reason,
              action: pendingRequest
                ? "ATTENDANCE_HOLIDAY_REQUEST_APPROVED"
                : "ATTENDANCE_SCHOOL_DAY_CLASS_HOLIDAY_DECLARED",
              extraMetadata: pendingRequest
                ? {
                    requestId: pendingRequest.id,
                    requestReason:
                      metadataString(pendingRequest.metadata, "reason") ??
                      "Teacher requested Holiday.",
                    decisionReason:
                      "Approved by the Headteacher's school-wide holiday declaration.",
                    viaSchoolWideDeclaration: true,
                  }
                : {
                    viaSchoolWideDeclaration: true,
                  },
            });

            declared += 1;
            reconciledMarks += applied.reconciledMarks;
            if (applied.certifiedEvidencePreserved) {
              certifiedEvidencePreserved += 1;
            }
            if (pendingRequest) {
              requestsResolved += 1;
            }

            affected.push({
              classroomId: classroom.id,
              classLabel: classLabel(classroom),
              outcome: "DECLARED",
            });
          }

          await tx.auditLog.create({
            data: {
              tenantId: safe.tenantId,
              userId: safe.userId,
              action: "ATTENDANCE_SCHOOL_DAY_DECLARED_HOLIDAY",
              resource: "AttendanceDay",
              resourceId: dateISO,
              ip: clientIp(req) ?? undefined,
              userAgent: userAgent(req) ?? undefined,
              metadata: {
                dateISO,
                reason,
                operationalClasses: operational.length,
                declared,
                alreadyHoliday,
                createdHolidaySessions,
                reconciledMarks,
                certifiedEvidencePreserved,
                requestsResolved,
                affected,
              } satisfies Prisma.InputJsonObject,
            },
          });

          return {
            declared,
            alreadyHoliday,
            createdHolidaySessions,
            reconciledMarks,
            certifiedEvidencePreserved,
            requestsResolved,
            operationalClasses: operational.length,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      return noStoreJson(200, {
        ok: true,
        action: "DECLARE_DAY",
        date: dateISO,
        reason,
        ...result,
      });
    }

    if (parsed.data.action === "APPROVE_REQUEST") {
      const { sessionId, decisionReason } = parsed.data;
      const result = await prisma.$transaction(
        async (tx) => {
          const session = await lockSession(
            tx,
            safe.tenantId,
            sessionId,
          );

          await assertAttendanceDateInCurrentTerm({
            tenantId: safe.tenantId,
            date: session.date,
            db: tx,
          });

          const requestEvent = await latestHolidayRequest(
            tx,
            safe.tenantId,
            session.id,
          );

          if (!requestEvent || requestEvent.action !== "ATTENDANCE_HOLIDAY_REQUESTED") {
            throw new RouteError(409, "No pending teacher Holiday request exists for this class.");
          }

          const requestReason =
            metadataString(requestEvent.metadata, "reason") ||
            "Teacher requested Holiday / school closed.";

          const applied = await applyHoliday({
            tx,
            req,
            tenantId: safe.tenantId,
            actorUserId: safe.userId,
            session,
            reason: requestReason,
            action: "ATTENDANCE_HOLIDAY_REQUEST_APPROVED",
            extraMetadata: {
              requestId: requestEvent.id,
              requestReason,
              requestedByUserId: requestEvent.userId,
              requestedAt: requestEvent.createdAt.toISOString(),
              decisionReason,
              approvedByHeadteacher: true,
            },
          });

          return {
            sessionId: session.id,
            classroomId: session.classroomId,
            requestReason,
            reconciledMarks: applied.reconciledMarks,
            certifiedEvidencePreserved: applied.certifiedEvidencePreserved,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      return noStoreJson(200, {
        ok: true,
        action: "APPROVE_REQUEST",
        ...result,
      });
    }

    if (parsed.data.action === "REJECT_REQUEST") {
      const { sessionId, decisionReason } = parsed.data;
      const result = await prisma.$transaction(
        async (tx) => {
          const session = await lockSession(
            tx,
            safe.tenantId,
            sessionId,
          );

          const requestEvent = await latestHolidayRequest(
            tx,
            safe.tenantId,
            session.id,
          );

          if (!requestEvent || requestEvent.action !== "ATTENDANCE_HOLIDAY_REQUESTED") {
            throw new RouteError(409, "No pending teacher Holiday request exists for this class.");
          }

          const requestReason =
            metadataString(requestEvent.metadata, "reason") ||
            "Teacher requested Holiday / school closed.";

          await tx.auditLog.create({
            data: {
              tenantId: safe.tenantId,
              userId: safe.userId,
              action: "ATTENDANCE_HOLIDAY_REQUEST_REJECTED",
              resource: "AttendanceSession",
              resourceId: session.id,
              ip: clientIp(req) ?? undefined,
              userAgent: userAgent(req) ?? undefined,
              metadata: {
                requestId: requestEvent.id,
                requestReason,
                requestedByUserId: requestEvent.userId,
                requestedAt: requestEvent.createdAt.toISOString(),
                decisionReason,
                existingAttendancePreserved: true,
              } satisfies Prisma.InputJsonObject,
            },
          });

          return {
            sessionId: session.id,
            classroomId: session.classroomId,
            requestReason,
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        },
      );

      return noStoreJson(200, {
        ok: true,
        action: "REJECT_REQUEST",
        ...result,
      });
    }

    if (parsed.data.action !== "REOPEN_CLASS") {
      throw new RouteError(400, "Unsupported Holiday action.");
    }

    const { sessionId, reason } = parsed.data;

    const result = await prisma.$transaction(
      async (tx) => {
        const session = await lockSession(
          tx,
          safe.tenantId,
          sessionId,
        );

        await assertAttendanceDateInCurrentTerm({
          tenantId: safe.tenantId,
          date: session.date,
          db: tx,
        });

        if (!session.isHoliday) {
          throw new RouteError(409, "This class is not currently marked Holiday.");
        }

        if (session.certifiedAt) {
          throw new RouteError(
            409,
            "A Holiday that superseded certified evidence cannot be reopened from this control.",
          );
        }

        const declarerMembership = session.holidayDeclaredByUserId
          ? await tx.membership.findFirst({
              where: {
                tenantId: safe.tenantId,
                userId: session.holidayDeclaredByUserId,
                status: "ACTIVE",
              },
              select: {
                role: {
                  select: {
                    name: true,
                  },
                },
              },
            })
          : null;

        if (normalizeRole(declarerMembership?.role?.name) !== "TEACHER") {
          throw new RouteError(
            409,
            "Only a teacher-declared Holiday can be reopened for marking from this control.",
          );
        }

        const markCount = await tx.attendanceMark.count({
          where: { sessionId: session.id },
        });

        if (markCount > 0) {
          throw new RouteError(
            409,
            "Holiday evidence is not empty. Review the attendance audit before reopening.",
          );
        }

        const updated = await tx.attendanceSession.updateMany({
          where: {
            id: session.id,
            tenantId: safe.tenantId,
            isHoliday: true,
            certifiedAt: null,
          },
          data: {
            isHoliday: false,
            holidayReason: null,
            holidayDeclaredAt: null,
            holidayDeclaredByUserId: null,
            isClosed: false,
            closedAt: null,
          },
        });

        if (updated.count !== 1) {
          throw new RouteError(
            409,
            "Attendance changed at the same time. Refresh and retry.",
          );
        }

        await tx.auditLog.create({
          data: {
            tenantId: safe.tenantId,
            userId: safe.userId,
            action: "ATTENDANCE_HOLIDAY_REOPENED_FOR_MARKING",
            resource: "AttendanceSession",
            resourceId: session.id,
            ip: clientIp(req) ?? undefined,
            userAgent: userAgent(req) ?? undefined,
            metadata: {
              reason,
              classroomId: session.classroomId,
              dateISO: session.date.toISOString().slice(0, 10),
              previousHoliday: {
                reason: session.holidayReason,
                declaredAt: isoOrNull(session.holidayDeclaredAt),
                declaredByUserId: session.holidayDeclaredByUserId,
              },
              teacherAttendanceRestored: true,
              originalHolidayDeclarationPreservedInAudit: true,
            } satisfies Prisma.InputJsonObject,
          },
        });

        return {
          sessionId: session.id,
          classroomId: session.classroomId,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return noStoreJson(200, {
      ok: true,
      action: "REOPEN_CLASS",
      ...result,
    });
  } catch (error: unknown) {
    if (error instanceof RouteError) {
      return noStoreJson(error.status, {
        ok: false,
        error: error.message,
      });
    }

    if (String((error as { code?: unknown })?.code ?? "") === "P2034") {
      return noStoreJson(409, {
        ok: false,
        error: "Attendance changed at the same time. Refresh and retry.",
      });
    }

    console.error("[HEADTEACHER_DAY_HOLIDAY_ERROR]", error);

    return noStoreJson(500, {
      ok: false,
      error: "Holiday action failed. Refresh and try again.",
    });
  }
}
