// src/app/api/teacher/attendance/notify-parents/route.ts
import { NextResponse } from "next/server";
import { AttendanceStatus, StudentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCK_TTL_MINUTES = 8;
const MAX_NOTIFICATIONS_PER_REQUEST = 120;

type Body = {
  sessionId?: string;
  brand?: string;
};

type NotifyResult = {
  studentId: string;
  studentName: string;
  ok: boolean;
  skipped: boolean;
  skipReason?: "NO_SMS_OPT_IN" | "NO_PHONE" | "NOT_ACTIVE_OR_NOT_FOUND";
  to?: string;
  error?: string;
};

function json(status: number, payload: unknown) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function isSessionIdLike(id: string) {
  return /^[a-zA-Z0-9_-]{10,100}$/.test(id);
}

function normRole(v: unknown) {
  return clean(v).toUpperCase().replace(/\s+/g, "_");
}

function isAdminLike(roleName: string | null | undefined) {
  const r = normRole(roleName);
  return r.includes("ADMIN") || r.includes("HEAD") || r.includes("OWNER") || r === "SUPERADMIN";
}

function normalizePhone(input: string | null | undefined): string | null {
  const raw = clean(input).replace(/\s+/g, "").replace(/-/g, "");
  if (!raw) return null;

  if (raw.startsWith("+") && raw.length >= 9) return raw;
  if (raw.startsWith("233") && raw.length >= 12) return `+${raw}`;
  if (raw.startsWith("0") && raw.length === 10) return `+233${raw.slice(1)}`;

  return raw.length >= 8 ? raw : null;
}

function studentName(student: { firstName?: string | null; lastName?: string | null }) {
  return [student.firstName, student.lastName].map(clean).filter(Boolean).join(" ") || "Your child";
}

function classLabel(classroom: { name?: string | null; grade?: string | null; arm?: string | null }) {
  const name = clean(classroom.name);
  const gradeArm = [clean(classroom.grade), clean(classroom.arm)].filter(Boolean).join(" ");
  return name || gradeArm || "your child's class";
}

function smsBody(params: {
  schoolName: string;
  studentName: string;
  classLabel: string;
  dateISO: string;
}) {
  return `${params.schoolName}: ${params.studentName} was marked ABSENT in ${params.classLabel} on ${params.dateISO}. If this is incorrect, please contact the school.`;
}

export async function POST(req: Request) {
  const auth = await requireApiUserContext(req, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const safe = {
    userId: auth.ctx.userId,
    tenantId: auth.ctx.tenantId,
    roleName: auth.ctx.roleName,
  };

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return json(415, { ok: false, error: "Content-Type must be application/json." });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const sessionId = clean(body?.sessionId);

  if (!sessionId || !isSessionIdLike(sessionId)) {
    return json(400, { ok: false, error: "Invalid sessionId." });
  }

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: safe.userId, tenantId: safe.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });

  if (!membership || membership.status !== "ACTIVE") {
    return json(403, { ok: false, error: "Forbidden (membership inactive)." });
  }

  const roleName = membership.role?.name ?? safe.roleName ?? null;
  const adminLike = isAdminLike(roleName);

  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: safe.tenantId },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      date: true,
      isClosed: true,
      certifiedAt: true,
      takenByUserId: true,
      certifiedByUserId: true,
      notifyingAt: true,
      notifiedAt: true,
      notifiedByUserId: true,
      classroom: {
        select: {
          name: true,
          grade: true,
          arm: true,
        },
      },
    },
  });

  if (!session) return json(404, { ok: false, error: "Session not found." });

  try {
    await assertCanAccessClassroom({
      userId: safe.userId,
      tenantId: safe.tenantId,
      classroomId: session.classroomId,
    });
  } catch (e) {
    return json(Number((e as { status?: number })?.status) || 403, {
      ok: false,
      error: e instanceof Error ? e.message : "Forbidden.",
    });
  }

  if (!adminLike && session.takenByUserId && session.takenByUserId !== safe.userId) {
    return json(403, { ok: false, error: "This session is owned by another user." });
  }

  if (!session.isClosed && !session.certifiedAt) {
    return json(409, {
      ok: false,
      error: "Close or certify the session before notifying parents.",
    });
  }

  const dateISO = session.date.toISOString().slice(0, 10);

  const absentMarks = await prisma.attendanceMark.findMany({
    where: {
      sessionId: session.id,
      status: AttendanceStatus.ABSENT,
    },
    select: {
      studentId: true,
      student: {
        select: {
          id: true,
          status: true,
          firstName: true,
          lastName: true,
          guardianName: true,
          guardianPhone: true,
          guardianPhoneNorm: true,
          guardianSmsOptIn: true,
        },
      },
    },
  });

  const sortedAbsentMarks = absentMarks.sort((a, b) =>
    studentName(a.student).localeCompare(studentName(b.student))
  );

  if (!sortedAbsentMarks.length) {
    return json(200, {
      ok: true,
      alreadyNotified: false,
      brand: "EDULIFEOS",
      testMode: process.env.SMS_TEST_MODE === "true",
      sessionId: session.id,
      absentCount: 0,
      eligibleCount: 0,
      successCount: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      skippedNoOptIn: 0,
      skippedNoPhone: 0,
      skippedNotActive: 0,
      results: [],
      summaryText: "No absent learners found for this session.",
    });
  }

  if (sortedAbsentMarks.length > MAX_NOTIFICATIONS_PER_REQUEST) {
    return json(400, {
      ok: false,
      error: `Too many absentee notifications in one request. Maximum is ${MAX_NOTIFICATIONS_PER_REQUEST}.`,
      absentCount: sortedAbsentMarks.length,
    });
  }

  if (session.notifiedAt) {
    let skippedNoOptIn = 0;
    let skippedNoPhone = 0;
    let skippedNotActive = 0;
    let eligibleCount = 0;

    for (const mark of sortedAbsentMarks) {
      const student = mark.student;

      if (!student || student.status !== StudentStatus.ACTIVE) {
        skippedNotActive += 1;
        continue;
      }

      if (!student.guardianSmsOptIn) {
        skippedNoOptIn += 1;
        continue;
      }

      const phone = normalizePhone(student.guardianPhoneNorm) || normalizePhone(student.guardianPhone);

      if (!phone) {
        skippedNoPhone += 1;
        continue;
      }

      eligibleCount += 1;
    }

    const skippedCount = skippedNoOptIn + skippedNoPhone + skippedNotActive;

    return json(200, {
      ok: true,
      alreadyNotified: true,
      notifiedAt: session.notifiedAt.toISOString(),
      brand: "EDULIFEOS",
      testMode: process.env.SMS_TEST_MODE === "true",
      sessionId: session.id,
      absentCount: sortedAbsentMarks.length,
      eligibleCount,
      successCount: 0,
      sentCount: 0,
      skippedCount,
      failedCount: 0,
      skippedNoOptIn,
      skippedNoPhone,
      skippedNotActive,
      results: [],
      summaryText: `Parents were already notified. Absent: ${sortedAbsentMarks.length}. Eligible at that time should be checked in SMS log if needed.`,
    });
  }

  const now = new Date();
  const lockCutoff = new Date(now.getTime() - LOCK_TTL_MINUTES * 60 * 1000);

  const claim = await prisma.attendanceSession.updateMany({
    where: {
      id: session.id,
      tenantId: safe.tenantId,
      notifiedAt: null,
      AND: [
        { OR: [{ notifyingAt: null }, { notifyingAt: { lt: lockCutoff } }] },
        { OR: [{ isClosed: true }, { certifiedAt: { not: null } }] },
      ],
    },
    data: {
      notifyingAt: now,
      notifiedByUserId: safe.userId,
    },
  });

  if (claim.count !== 1) {
    const current = await prisma.attendanceSession.findFirst({
      where: { id: session.id, tenantId: safe.tenantId },
      select: { notifiedAt: true, notifyingAt: true },
    });

    if (current?.notifiedAt) {
      return json(200, {
        ok: true,
        alreadyNotified: true,
        notifiedAt: current.notifiedAt.toISOString(),
        brand: "EDULIFEOS",
        testMode: process.env.SMS_TEST_MODE === "true",
        sessionId: session.id,
        absentCount: sortedAbsentMarks.length,
        eligibleCount: 0,
        successCount: 0,
        sentCount: 0,
        skippedCount: 0,
        failedCount: 0,
        skippedNoOptIn: 0,
        skippedNoPhone: 0,
        skippedNotActive: 0,
        results: [],
        summaryText: "Parents were already notified for this session.",
      });
    }

    return json(409, {
      ok: false,
      inProgress: true,
      error: "Notification already in progress. Please wait.",
    });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: safe.tenantId },
    select: { name: true },
  });

  const schoolName = tenant?.name ?? "Your school";
  const label = classLabel(session.classroom);
  const results: NotifyResult[] = [];

  let eligibleCount = 0;
  let successCount = 0;
  let failedCount = 0;
  let skippedNoOptIn = 0;
  let skippedNoPhone = 0;
  let skippedNotActive = 0;

  try {
    for (const mark of sortedAbsentMarks) {
      const student = mark.student;
      const name = studentName(student);

      if (!student || student.status !== StudentStatus.ACTIVE) {
        skippedNotActive += 1;
        results.push({
          studentId: mark.studentId,
          studentName: name,
          ok: false,
          skipped: true,
          skipReason: "NOT_ACTIVE_OR_NOT_FOUND",
          error: "Student is not active or was not found.",
        });
        continue;
      }

      if (!student.guardianSmsOptIn) {
        skippedNoOptIn += 1;
        results.push({
          studentId: student.id,
          studentName: name,
          ok: false,
          skipped: true,
          skipReason: "NO_SMS_OPT_IN",
          error: "Guardian has not opted in for SMS alerts.",
        });
        continue;
      }

      const to = normalizePhone(student.guardianPhoneNorm) || normalizePhone(student.guardianPhone);

      if (!to) {
        skippedNoPhone += 1;
        results.push({
          studentId: student.id,
          studentName: name,
          ok: false,
          skipped: true,
          skipReason: "NO_PHONE",
          error: "Guardian phone is missing.",
        });
        continue;
      }

      eligibleCount += 1;

      const sms = await sendSms({
        tenantId: safe.tenantId,
        actorId: safe.userId,
        to,
        message: smsBody({
          schoolName,
          studentName: name,
          classLabel: label,
          dateISO,
        }),
        from: "EDULIFEOS",
        template: "ATTENDANCE_ABSENCE_ALERT",
        payload: {
          purpose: "attendance_absence_alert",
          sessionId: session.id,
          classroomId: session.classroomId,
          studentId: student.id,
          studentName: name,
          dateISO,
          classLabel: label,
        },
      });

      if (sms.ok) {
        successCount += 1;
      } else {
        failedCount += 1;
      }

      results.push({
        studentId: student.id,
        studentName: name,
        ok: sms.ok,
        skipped: false,
        to: sms.to ?? to,
        ...(sms.ok ? {} : { error: sms.error ?? "SMS was not accepted." }),
      });
    }

    const skippedCount = skippedNoOptIn + skippedNoPhone + skippedNotActive;

    await prisma.attendanceSession.update({
      where: { id: session.id },
      data: {
        notifiedAt: successCount > 0 ? new Date() : null,
        notifyingAt: null,
        notifiedByUserId: safe.userId,
      },
    });

    try {
      await prisma.auditLog.create({
        data: {
          tenantId: safe.tenantId,
          userId: safe.userId,
          action: "ATTENDANCE_ABSENTEE_NOTIFY_ATTEMPTED",
          resource: "AttendanceSession",
          resourceId: session.id,
          metadata: {
            classroomId: session.classroomId,
            dateISO,
            absentCount: sortedAbsentMarks.length,
            eligibleCount,
            successCount,
            sentCount: successCount,
            failedCount,
            skippedCount,
            skippedNoOptIn,
            skippedNoPhone,
            skippedNotActive,
            smsTestMode: process.env.SMS_TEST_MODE === "true",
            results: results.map((r) => ({
              studentId: r.studentId,
              studentName: r.studentName,
              ok: r.ok,
              skipped: r.skipped,
              skipReason: r.skipReason ?? null,
              error: r.error ?? null,
            })),
          } satisfies Prisma.JsonObject,
        },
      });
    } catch {
      // Audit failure must not break notification flow.
    }

    return json(200, {
      ok: failedCount === 0,
      brand: "EDULIFEOS",
      testMode: process.env.SMS_TEST_MODE === "true",
      sessionId: session.id,
      absentCount: sortedAbsentMarks.length,
      eligibleCount,
      successCount,
      sentCount: successCount,
      skippedCount,
      failedCount,
      skippedNoOptIn,
      skippedNoPhone,
      skippedNotActive,
      results,
      summaryText: `Absent: ${sortedAbsentMarks.length}. SMS eligible: ${eligibleCount}. Sent: ${successCount}. Skipped: ${skippedCount}. Failed: ${failedCount}.`,
    });
  } catch (e) {
    await prisma.attendanceSession.update({
      where: { id: session.id },
      data: { notifyingAt: null },
    });

    return json(500, {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to notify parents. Please try again.",
    });
  }
}