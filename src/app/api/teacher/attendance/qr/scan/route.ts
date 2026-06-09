// src/app/api/teacher/attendance/qr/scan/route.ts
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { AttendanceScanStatus, AttendanceStatus, StudentStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import {
  requireTenantContext,
  assertTenantParamMatches,
  toHttpError,
} from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    tenantId: z.string().optional(), // legacy/back-compat only
    sessionId: z.string().trim().min(1, "sessionId is required."),
    token: z.string().trim().min(16, "QR token is too short.").max(700, "QR token is too long."),
  })
  .strict();

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
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

function userAgent(req: Request) {
  return req.headers.get("user-agent") || null;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function extractBadgeSecret(input: string) {
  const raw = input.trim();

  // Supported payloads:
  // 1. EDULIFEOS-ATT-V1:<secret>
  // 2. edulifeos:att:v1:<secret>
  // 3. https://.../attendance/check-in?b=<secret>
  // 4. raw secret
  try {
    const url = new URL(raw);
    const fromB = url.searchParams.get("b") || url.searchParams.get("badge") || url.searchParams.get("token");
    if (fromB?.trim()) return fromB.trim();
  } catch {
    // not a URL; continue below
  }

  const prefixes = ["EDULIFEOS-ATT-V1:", "edulifeos:att:v1:"];
  for (const prefix of prefixes) {
    if (raw.startsWith(prefix)) return raw.slice(prefix.length).trim();
  }

  return raw;
}

function isIdLike(id: string) {
  return /^[a-zA-Z0-9_-]{10,100}$/.test(id);
}

function fullName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim() || "Unnamed learner";
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

async function recordScanEvent(args: {
  tenantId: string;
  sessionId: string;
  classroomId: string;
  scannedByUserId: string;
  rawTokenHash: string;
  idempotencyKey: string;
  status: AttendanceScanStatus;
  reason: string;
  studentId?: string | null;
  badgeId?: string | null;
  attendanceStatus?: AttendanceStatus | null;
  ip?: string | null;
  userAgent?: string | null;
}) {
  return prisma.attendanceScanEvent.upsert({
    where: {
      tenantId_idempotencyKey: {
        tenantId: args.tenantId,
        idempotencyKey: args.idempotencyKey,
      },
    },
    create: {
      tenantId: args.tenantId,
      sessionId: args.sessionId,
      classroomId: args.classroomId,
      studentId: args.studentId ?? null,
      badgeId: args.badgeId ?? null,
      scannedByUserId: args.scannedByUserId,
      source: "QR",
      status: args.status,
      attendanceStatus: args.attendanceStatus ?? null,
      reason: args.reason,
      rawTokenHash: args.rawTokenHash,
      idempotencyKey: args.idempotencyKey,
      metadata: {
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
      },
    },
    update: {
      status: AttendanceScanStatus.DUPLICATE,
      reason: "Duplicate scan for this session/token.",
      metadata: {
        ip: args.ip ?? null,
        userAgent: args.userAgent ?? null,
        duplicateSeenAt: new Date().toISOString(),
      },
    },
    select: { id: true, status: true, reason: true },
  });
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const safe = { userId: ctx.userId, tenantId: ctx.tenantId };

    const ct = req.headers.get("content-type") || "";
    if (!ct.toLowerCase().includes("application/json")) {
      return noStoreJson(415, { ok: false, error: "Content-Type must be application/json." });
    }

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return noStoreJson(400, { ok: false, error: parsed.error.issues[0]?.message || "Invalid body." });
    }

    const sessionId = parsed.data.sessionId.trim();
    if (!isIdLike(sessionId)) return noStoreJson(400, { ok: false, error: "Invalid sessionId." });

    const suppliedTenantId = parsed.data.tenantId?.trim() || null;
    assertTenantParamMatches(safe.tenantId, suppliedTenantId);

    const secret = extractBadgeSecret(parsed.data.token);
    if (!/^[a-zA-Z0-9._~:-]{16,512}$/.test(secret)) {
      return noStoreJson(400, { ok: false, error: "Invalid QR token format." });
    }

    const tokenHash = sha256Hex(secret);
    const idempotencyKey = `qr:${sessionId}:${tokenHash}`;

    const [roleName, session] = await Promise.all([
      loadActiveRoleName(safe.userId, safe.tenantId),
      prisma.attendanceSession.findFirst({
        where: { id: sessionId, tenantId: safe.tenantId },
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

    if (!session) return noStoreJson(404, { ok: false, error: "Attendance session not found." });

    await assertCanAccessClassroom({ ...safe, classroomId: session.classroomId });

    const adminLike = isAdminLike(roleName);
    if (!adminLike && session.takenByUserId && session.takenByUserId !== safe.userId) {
      return noStoreJson(403, { ok: false, error: "This session is owned by another user." });
    }

    if (session.certifiedAt) {
      return noStoreJson(409, { ok: false, error: "Session is certified and cannot accept QR scans." });
    }

    if (session.isClosed) {
      return noStoreJson(409, { ok: false, error: "Session is closed. Reopen it before scanning." });
    }

    const badge = await prisma.studentAttendanceBadge.findFirst({
      where: { tenantId: safe.tenantId, tokenHash },
      select: {
        id: true,
        tenantId: true,
        studentId: true,
        revokedAt: true,
        student: {
          select: {
            id: true,
            tenantId: true,
            classroomId: true,
            status: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const eventBase = {
      tenantId: safe.tenantId,
      sessionId: session.id,
      classroomId: session.classroomId,
      scannedByUserId: safe.userId,
      rawTokenHash: tokenHash,
      idempotencyKey,
      ip: clientIp(req),
      userAgent: userAgent(req),
    };

    if (!badge) {
      await recordScanEvent({ ...eventBase, status: AttendanceScanStatus.REJECTED, reason: "Badge token not found." });
      return noStoreJson(404, { ok: false, error: "Badge not recognized." });
    }

    if (badge.revokedAt) {
      await recordScanEvent({
        ...eventBase,
        badgeId: badge.id,
        studentId: badge.studentId,
        status: AttendanceScanStatus.REJECTED,
        reason: "Badge was revoked.",
      });
      return noStoreJson(409, { ok: false, error: "Badge has been revoked." });
    }

    if (!badge.student || badge.student.status !== StudentStatus.ACTIVE) {
      await recordScanEvent({
        ...eventBase,
        badgeId: badge.id,
        studentId: badge.studentId,
        status: AttendanceScanStatus.REJECTED,
        reason: "Student is archived or missing.",
      });
      return noStoreJson(409, { ok: false, error: "Learner is archived or unavailable." });
    }

    if (badge.student.tenantId !== safe.tenantId || badge.student.classroomId !== session.classroomId) {
      await recordScanEvent({
        ...eventBase,
        badgeId: badge.id,
        studentId: badge.studentId,
        status: AttendanceScanStatus.REJECTED,
        reason: "Badge does not belong to this class/session.",
      });
      return noStoreJson(409, { ok: false, error: "This badge does not belong to this class session." });
    }

    const existingMark = await prisma.attendanceMark.findUnique({
      where: { sessionId_studentId: { sessionId: session.id, studentId: badge.studentId } },
      select: { id: true, status: true, note: true },
    });

    const studentName = fullName(badge.student.firstName, badge.student.lastName);

    if (existingMark) {
      const scanEvent = await recordScanEvent({
        ...eventBase,
        badgeId: badge.id,
        studentId: badge.studentId,
        status: AttendanceScanStatus.DUPLICATE,
        attendanceStatus: existingMark.status,
        reason: `Learner already marked ${existingMark.status}.`,
      });

      return noStoreJson(200, {
        ok: true,
        status: scanEvent.status,
        duplicate: true,
        studentId: badge.studentId,
        studentName,
        attendanceStatus: existingMark.status,
        message:
          existingMark.status === "PRESENT"
            ? `${studentName} is already marked PRESENT.`
            : `${studentName} is already marked ${existingMark.status}. Use manual attendance to change it if needed.`,
      });
    }

    const created = await prisma.$transaction(async (tx) => {
      const mark = await tx.attendanceMark.create({
        data: {
          sessionId: session.id,
          studentId: badge.studentId,
          status: AttendanceStatus.PRESENT,
          note: "Marked PRESENT by QR badge scan.",
        },
        select: { id: true },
      });

      await tx.studentAttendanceBadge.update({
        where: { id: badge.id },
        data: { lastUsedAt: new Date() },
        select: { id: true },
      });

      const event = await tx.attendanceScanEvent.upsert({
        where: {
          tenantId_idempotencyKey: {
            tenantId: safe.tenantId,
            idempotencyKey,
          },
        },
        create: {
          tenantId: safe.tenantId,
          sessionId: session.id,
          classroomId: session.classroomId,
          studentId: badge.studentId,
          badgeId: badge.id,
          scannedByUserId: safe.userId,
          source: "QR",
          status: AttendanceScanStatus.ACCEPTED,
          attendanceStatus: AttendanceStatus.PRESENT,
          reason: "Marked PRESENT by QR badge scan.",
          rawTokenHash: tokenHash,
          idempotencyKey,
          metadata: {
            ip: clientIp(req),
            userAgent: userAgent(req),
            attendanceMarkId: mark.id,
          },
        },
        update: {
          status: AttendanceScanStatus.DUPLICATE,
          reason: "Duplicate scan for this session/token.",
          metadata: {
            ip: clientIp(req),
            userAgent: userAgent(req),
            duplicateSeenAt: new Date().toISOString(),
            attendanceMarkId: mark.id,
          },
        },
        select: { id: true, status: true },
      });

      return { mark, event };
    });

    await writeAuditLog({
      action: "ATTENDANCE_QR_SCAN_ACCEPTED",
      tenantId: safe.tenantId,
      userId: safe.userId,
      resource: "AttendanceSession",
      resourceId: session.id,
      ip: clientIp(req),
      userAgent: userAgent(req),
      metadata: {
        classroomId: session.classroomId,
        dateISO: session.date.toISOString().slice(0, 10),
        badgeId: badge.id,
        studentId: badge.studentId,
        attendanceMarkId: created.mark.id,
        scanEventId: created.event.id,
        roleName,
        adminLike,
      },
    });

    return noStoreJson(200, {
      ok: true,
      status: created.event.status,
      duplicate: false,
      studentId: badge.studentId,
      studentName,
      attendanceStatus: "PRESENT",
      message: `${studentName} marked PRESENT by QR scan.`,
    });
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return noStoreJson(status, { ok: false, error: msg });
  }
}
