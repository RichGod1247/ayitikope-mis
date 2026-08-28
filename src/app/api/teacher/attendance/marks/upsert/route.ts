// src/app/api/teacher/attendance/marks/upsert/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { AttendanceStatus, StudentStatus } from "@prisma/client";
import { z } from "zod";
import { writeAuditLog } from "@/lib/audit";
import { assertAttendanceDateInCurrentTerm } from "@/lib/server/attendanceAcademicCalendar";
import {
  requireTenantContext,
  assertTenantParamMatches,
  toHttpError,
} from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INPUT_STATUS = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
const QR_GENERATED_NOTE = "Marked PRESENT by QR badge scan.";

const ItemSchema = z.object({
  studentId: z.string().trim().min(1, "studentId is required."),
  status: z.enum(INPUT_STATUS),
  note: z.string().max(280, "Note is too long.").optional().nullable(),
});

const BodySchema = z
  .object({
    tenantId: z.string().optional(), // legacy compatibility only
    sessionId: z.string().trim().min(1, "sessionId is required."),
    items: z.array(ItemSchema).min(1, "At least one attendance mark is required.").max(800, "Too many items."),
  })
  .strict();

type DesiredMark = {
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
};

type ExistingMark = {
  id: string;
  studentId: string;
  status: AttendanceStatus;
  note: string | null;
};

type AuditChange = {
  studentId: string;
  from: {
    status: AttendanceStatus | null;
    note: string | null;
  };
  to: {
    status: AttendanceStatus;
    note: string | null;
  };
};

function noStoreJson(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isIdLike(id: string) {
  return /^[a-zA-Z0-9_-]{10,100}$/.test(id);
}

function clientIp(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

function userAgent(req: Request) {
  return req.headers.get("user-agent") || null;
}

function cleanNote(v: string | null | undefined) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function normalizeManualNote(existing: ExistingMark | undefined, desired: DesiredMark): string | null {
  const note = desired.note;

  // C.2A hardening:
  // QR may write a machine-generated evidence note when it marks PRESENT.
  // If a teacher later edits that mark manually, the old QR note must not
  // remain beside a new manual truth such as ABSENT/LATE/EXCUSED.
  if (note !== QR_GENERATED_NOTE) return note;

  if (!existing) return null;

  if (existing.status !== desired.status) return null;

  if (desired.status !== "PRESENT") return null;

  return note;
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

function sameMark(existing: ExistingMark, desired: DesiredMark) {
  return existing.status === desired.status && (existing.note ?? null) === (desired.note ?? null);
}

function isManualStatus(status: AttendanceStatus): status is "PRESENT" | "ABSENT" {
  return status === "PRESENT" || status === "ABSENT";
}

function isPreservedLegacyStatus(status: AttendanceStatus) {
  return status === "LATE" || status === "EXCUSED";
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const safe = { userId: ctx.userId, tenantId: ctx.tenantId };

    const ct = req.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
      return noStoreJson(415, {
        ok: false,
        error: "Content-Type must be application/json.",
      });
    }

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);

    if (!parsed.success) {
      return noStoreJson(400, {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid body.",
      });
    }

    const { sessionId, items, tenantId: tenantIdParam } = parsed.data;

    const sessionIdClean = sessionId.trim();
    if (!isIdLike(sessionIdClean)) {
      return noStoreJson(400, { ok: false, error: "Invalid sessionId." });
    }

    const suppliedTenantId = tenantIdParam?.trim() || null;
    assertTenantParamMatches(safe.tenantId, suppliedTenantId);

    // Last write wins inside one request, but duplicate IDs are not allowed to create duplicate DB rows.
    const desiredByStudent = new Map<string, DesiredMark>();

    for (const item of items) {
      const studentId = item.studentId.trim();
      if (!studentId) continue;

      desiredByStudent.set(studentId, {
        studentId,
        status: item.status as AttendanceStatus,
        note: cleanNote(item.note),
      });
    }

    const desired = Array.from(desiredByStudent.values());

    if (!desired.length) {
      return noStoreJson(400, { ok: false, error: "No valid students provided." });
    }

    const studentIds = desired.map((item) => item.studentId);

    const [roleName, session] = await Promise.all([
      loadActiveRoleName(safe.userId, safe.tenantId),
      prisma.attendanceSession.findFirst({
        where: {
          id: sessionIdClean,
          tenantId: safe.tenantId,
        },
        select: {
          id: true,
          tenantId: true,
          classroomId: true,
          date: true,
          isClosed: true,
          certifiedAt: true,
          takenByUserId: true,
          classroom: { select: { name: true, grade: true, arm: true } },
        },
      }),
    ]);

    if (!session) {
      return noStoreJson(404, { ok: false, error: "Session not found." });
    }

    if (session.certifiedAt) {
      return noStoreJson(409, {
        ok: false,
        error: "Session is certified and cannot be edited.",
      });
    }

    if (session.isClosed) {
      return noStoreJson(409, {
        ok: false,
        error: "Session is closed. Reopen it before editing.",
      });
    }

    await assertCanAccessClassroom({
      ...safe,
      classroomId: session.classroomId,
    });
    await assertAttendanceDateInCurrentTerm({
      tenantId: safe.tenantId,
      date: session.date,
    });

    const adminLike = isAdminLike(roleName);

    if (!adminLike && session.takenByUserId && session.takenByUserId !== safe.userId) {
      return noStoreJson(403, {
        ok: false,
        error: "This session is owned by another user.",
      });
    }

    const activeStudents = await prisma.student.findMany({
      where: {
        tenantId: safe.tenantId,
        classroomId: session.classroomId,
        status: StudentStatus.ACTIVE,
        id: { in: studentIds },
      },
      select: { id: true },
    });

    const activeSet = new Set(activeStudents.map((student) => student.id));

    if (activeSet.size !== studentIds.length) {
      return noStoreJson(400, {
        ok: false,
        error: "One or more learners do not belong to this class or are archived.",
      });
    }

    const existingRows = await prisma.attendanceMark.findMany({
      where: {
        sessionId: session.id,
        studentId: { in: studentIds },
      },
      select: {
        id: true,
        studentId: true,
        status: true,
        note: true,
      },
    });

    const existingByStudent = new Map<string, ExistingMark>(
      existingRows.map((mark) => [
        mark.studentId,
        {
          id: mark.id,
          studentId: mark.studentId,
          status: mark.status,
          note: mark.note ?? null,
        },
      ])
    );

    // UI-P2 manual-register policy:
    // New manual truth is binary: PRESENT or ABSENT.
    // Historical LATE/EXCUSED rows remain readable and may be re-saved only
    // when their status is unchanged, so old records/notes are not destroyed.
    for (const desiredMark of desired) {
      if (isManualStatus(desiredMark.status)) continue;

      const existing = existingByStudent.get(desiredMark.studentId);
      const preservesExistingLegacyStatus =
        isPreservedLegacyStatus(desiredMark.status) &&
        existing?.status === desiredMark.status;

      if (!preservesExistingLegacyStatus) {
        return noStoreJson(400, {
          ok: false,
          error:
            "Manual attendance accepts only PRESENT or ABSENT. Existing Late/Excused records may be preserved until corrected.",
        });
      }
    }

    const auditChanges: AuditChange[] = [];
    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    await prisma.$transaction(async (tx) => {
      for (const desiredMarkRaw of desired) {
        const existing = existingByStudent.get(desiredMarkRaw.studentId);
        const desiredMark: DesiredMark = {
          ...desiredMarkRaw,
          note: normalizeManualNote(existing, desiredMarkRaw),
        };

        if (existing && sameMark(existing, desiredMark)) {
          unchangedCount += 1;
          continue;
        }

        if (existing) {
          await tx.attendanceMark.update({
            where: { id: existing.id },
            data: {
              status: desiredMark.status,
              note: desiredMark.note,
            },
          });

          updatedCount += 1;

          auditChanges.push({
            studentId: desiredMark.studentId,
            from: {
              status: existing.status,
              note: existing.note,
            },
            to: {
              status: desiredMark.status,
              note: desiredMark.note,
            },
          });

          continue;
        }

        await tx.attendanceMark.upsert({
          where: {
            sessionId_studentId: {
              sessionId: session.id,
              studentId: desiredMark.studentId,
            },
          },
          create: {
            sessionId: session.id,
            studentId: desiredMark.studentId,
            status: desiredMark.status,
            note: desiredMark.note,
          },
          update: {
            status: desiredMark.status,
            note: desiredMark.note,
          },
          select: { id: true },
        });

        createdCount += 1;

        auditChanges.push({
          studentId: desiredMark.studentId,
          from: {
            status: null,
            note: null,
          },
          to: {
            status: desiredMark.status,
            note: desiredMark.note,
          },
        });
      }
    });

    if (createdCount || updatedCount) {
      await writeAuditLog({
        action: "ATTENDANCE_MARKS_UPSERTED",
        tenantId: safe.tenantId,
        userId: safe.userId,
        resource: "AttendanceSession",
        resourceId: session.id,
        ip: clientIp(req),
        userAgent: userAgent(req),
        metadata: {
          classroomId: session.classroomId,
          classroomName: session.classroom?.name ?? null,
          dateISO: session.date.toISOString().slice(0, 10),
          roleName,
          adminLike,
          manualStatusPolicy: "PRESENT_ABSENT_ONLY",
          legacyStatusCompatibility: "UNCHANGED_EXISTING_ONLY",
          requestedCount: items.length,
          dedupedCount: desired.length,
          createdCount,
          updatedCount,
          unchangedCount,
          correctionCount: updatedCount,
          changes: auditChanges.slice(0, 100),
          changesTruncated: auditChanges.length > 100,
        },
      });
    }

    return noStoreJson(200, {
      ok: true,
      count: desired.length,
      createdCount,
      updatedCount,
      unchangedCount,
      correctionCount: updatedCount,
    });
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return noStoreJson(status, { ok: false, error: msg });
  }
}