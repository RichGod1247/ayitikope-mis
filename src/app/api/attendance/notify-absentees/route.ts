// src/app/api/attendance/notify-absentees/route.ts
import { NextResponse } from "next/server";
import { AttendanceStatus, StudentStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { sendSms } from "@/lib/sms";
import {
  getGuardianEssentialAlertEligibilityMap,
  type GuardianEssentialAlertEligibilityReason,
} from "@/lib/essentialAlerts/enrollment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOCK_TTL_MINUTES = 8;
const MAX_NOTIFICATIONS_PER_REQUEST = 120;

type NotifyRequestBody = {
  tenantId?: string; // legacy/back-compat only
  classroomId?: string;
  date?: string; // YYYY-MM-DD
  studentIds?: string[];
};

type ResultRow = {
  studentId: string;
  studentName: string;
  kind: "ABSENT";
  ok: boolean;
  skipped: boolean;
  skipReason?: "NO_SMS_OPT_IN" | "NO_PHONE" | "NOT_ACTIVE_OR_NOT_FOUND";
  essentialAlertEligibility?: GuardianEssentialAlertEligibilityReason;
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

function parseDateISO(v: string): Date {
  const s = clean(v);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    throw new Error("Invalid date. Use YYYY-MM-DD.");
  }

  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");

  return d;
}

function normRole(v: unknown) {
  return clean(v).toUpperCase().replace(/\s+/g, "_");
}

function studentName(s: { firstName?: string | null; lastName?: string | null }) {
  return [s.firstName, s.lastName].map(clean).filter(Boolean).join(" ") || "Your child";
}

function classLabel(c: { name?: string | null; grade?: string | null; arm?: string | null }) {
  const name = clean(c.name);
  const gradeArm = [clean(c.grade), clean(c.arm)].filter(Boolean).join(" ");
  return name || gradeArm || "your child's class";
}

function smsBody(params: {
  schoolName: string;
  studentName: string;
  classLabel: string;
  date: string;
}) {
  return `${params.schoolName}: ${params.studentName} was marked ABSENT in ${params.classLabel} on ${params.date}. If this is incorrect, please contact the school.`;
}

export async function POST(request: Request) {
  const auth = await requireApiUserContext(request, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });

  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;
  const roleName = normRole(ctx.roleName);

  const body = (await request.json().catch(() => ({}))) as NotifyRequestBody;

  const tenantIdFromClient = clean(body.tenantId);
  if (tenantIdFromClient && tenantIdFromClient !== ctx.tenantId) {
    return json(403, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }

  const tenantId = ctx.tenantId;
  const classroomId = clean(body.classroomId);
  const dateStr = clean(body.date);

  if (!classroomId || !dateStr) {
    return json(400, {
      ok: false,
      error: "classroomId and date are required.",
    });
  }

  let date: Date;
  try {
    date = parseDateISO(dateStr);
  } catch (e) {
    return json(400, {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid date.",
    });
  }

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId },
    select: { id: true, name: true, grade: true, arm: true },
  });

  if (!classroom) {
    return json(404, { ok: false, error: "Classroom not found." });
  }

  if (roleName === "TEACHER") {
    try {
      await assertCanAccessClassroom({
        userId: ctx.userId,
        tenantId,
        classroomId,
      });
    } catch (e) {
      return json(Number((e as { status?: number })?.status) || 403, {
        ok: false,
        error: e instanceof Error ? e.message : "FORBIDDEN",
      });
    }
  }

  const session = await prisma.attendanceSession.findFirst({
    where: { tenantId, classroomId, date },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      isClosed: true,
      certifiedAt: true,
      notifyingAt: true,
      notifiedAt: true,
      notifiedByUserId: true,
    },
  });

  if (!session) {
    return json(400, {
      ok: false,
      error: "No attendance session found for this class/date.",
    });
  }

  const sessionState = session.certifiedAt ? "CERTIFIED" : session.isClosed ? "CLOSED" : "OPEN";

  if (sessionState !== "CLOSED" && sessionState !== "CERTIFIED") {
    return json(400, {
      ok: false,
      error: "Close or certify the session before notifying parents.",
      sessionState,
    });
  }

  const requestedFilter = new Set<string>();
  for (const id of Array.isArray(body.studentIds) ? body.studentIds : []) {
    const cleanId = clean(id);
    if (cleanId) requestedFilter.add(cleanId);
  }

  const hasFilter = requestedFilter.size > 0;

  const allAbsentMarks = await prisma.attendanceMark.findMany({
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
          guardianPhone: true,
          guardianPhoneNorm: true,
        },
      },
    },
    orderBy: {
      student: {
        lastName: "asc",
      },
    },
  });

  if (!allAbsentMarks.length) {
    return json(200, {
      ok: true,
      alreadyNotified: false,
      tenantId,
      classroomId,
      date: dateStr,
      sessionId: session.id,
      total: 0,
      absentCount: 0,
      eligibleCount: 0,
      successCount: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      skippedNoOptIn: 0,
      skippedNotEnrolled: 0,
      skippedNoPhone: 0,
      skippedNotActive: 0,
      eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
      essentialAlertPurpose: "STUDENT_ATTENDANCE",
      brand: "EDULIFEOS",
      testMode: process.env.SMS_TEST_MODE === "true",
      results: [],
      summaryText: "No absent learners found for this class/date.",
    });
  }

  if (allAbsentMarks.length > MAX_NOTIFICATIONS_PER_REQUEST) {
    return json(400, {
      ok: false,
      error: `Too many absentee notifications in one request. Maximum is ${MAX_NOTIFICATIONS_PER_REQUEST}.`,
      absentCount: allAbsentMarks.length,
    });
  }

  // Session-level replay protection can safely seal only a complete absentee notification.
  // A partial studentIds filter could otherwise seal the session while leaving other absentees unsent.
  if (hasFilter) {
    const allAbsentIds = new Set(allAbsentMarks.map((mark) => mark.studentId));
    const exactFullSet =
      requestedFilter.size === allAbsentIds.size &&
      Array.from(requestedFilter).every((id) => allAbsentIds.has(id));

    if (!exactFullSet) {
      return json(409, {
        ok: false,
        error: "PARTIAL_NOTIFICATION_FILTER_NOT_SUPPORTED",
        detail:
          "Session-level replay protection requires notifying the complete current absentee set.",
        sessionId: session.id,
        absentCount: allAbsentMarks.length,
      });
    }
  }

  if (session.notifiedAt) {
    return json(200, {
      ok: true,
      alreadyNotified: true,
      notifiedAt: session.notifiedAt.toISOString(),
      tenantId,
      classroomId,
      date: dateStr,
      sessionId: session.id,
      total: allAbsentMarks.length,
      absentCount: allAbsentMarks.length,
      eligibleCount: 0,
      successCount: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      skippedNoOptIn: 0,
      skippedNotEnrolled: 0,
      skippedNoPhone: 0,
      skippedNotActive: 0,
      eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
      essentialAlertPurpose: "STUDENT_ATTENDANCE",
      brand: "EDULIFEOS",
      testMode: process.env.SMS_TEST_MODE === "true",
      results: [],
      summaryText: "Parents were already notified for this session.",
    });
  }

  const now = new Date();
  const lockCutoff = new Date(now.getTime() - LOCK_TTL_MINUTES * 60 * 1000);

  const claim = await prisma.attendanceSession.updateMany({
    where: {
      id: session.id,
      tenantId,
      notifiedAt: null,
      AND: [
        { OR: [{ notifyingAt: null }, { notifyingAt: { lt: lockCutoff } }] },
        { OR: [{ isClosed: true }, { certifiedAt: { not: null } }] },
      ],
    },
    data: {
      notifyingAt: now,
      notifiedByUserId: ctx.userId,
    },
  });

  if (claim.count !== 1) {
    const current = await prisma.attendanceSession.findFirst({
      where: { id: session.id, tenantId },
      select: { notifiedAt: true, notifyingAt: true },
    });

    if (current?.notifiedAt) {
      return json(200, {
        ok: true,
        alreadyNotified: true,
        notifiedAt: current.notifiedAt.toISOString(),
        tenantId,
        classroomId,
        date: dateStr,
        sessionId: session.id,
        total: allAbsentMarks.length,
        absentCount: allAbsentMarks.length,
        eligibleCount: 0,
        successCount: 0,
        sentCount: 0,
        skippedCount: 0,
        failedCount: 0,
        skippedNoOptIn: 0,
        skippedNotEnrolled: 0,
        skippedNoPhone: 0,
        skippedNotActive: 0,
        eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
        essentialAlertPurpose: "STUDENT_ATTENDANCE",
        brand: "EDULIFEOS",
        testMode: process.env.SMS_TEST_MODE === "true",
        results: [],
        summaryText: "Parents were already notified for this session.",
      });
    }

    return json(409, {
      ok: false,
      inProgress: true,
      error: "Notification already in progress. Please wait.",
      sessionId: session.id,
    });
  }

  const absentMarks = allAbsentMarks;
  const results: ResultRow[] = [];

  let eligibleCount = 0;
  let successCount = 0;
  let failedCount = 0;
  let skippedNoOptIn = 0;
  let skippedNoPhone = 0;
  let skippedNotActive = 0;

  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    const schoolName = tenant?.name ?? "Your school";
    const label = classLabel(classroom);

    const guardianEligibilityByStudent =
      await getGuardianEssentialAlertEligibilityMap({
        tenantId,
        purpose: "STUDENT_ATTENDANCE",
        students: absentMarks.map((mark) => ({
          id: mark.student.id,
          guardianPhone: mark.student.guardianPhone,
          guardianPhoneNorm: mark.student.guardianPhoneNorm,
        })),
      });

    for (const mark of absentMarks) {
      const student = mark.student;
      const name = studentName(student);

      if (!student || student.status !== StudentStatus.ACTIVE) {
        skippedNotActive += 1;
        results.push({
          studentId: mark.studentId,
          studentName: name,
          kind: "ABSENT",
          ok: false,
          skipped: true,
          skipReason: "NOT_ACTIVE_OR_NOT_FOUND",
          error: "Student is not active or was not found.",
        });
        continue;
      }

      const essentialAlertEligibility =
        guardianEligibilityByStudent.get(student.id) ?? {
          eligible: false,
          reason: "NOT_ENROLLED" as const,
          phoneNorm: null,
          enrollmentStatus: null,
        };

      if (!essentialAlertEligibility.eligible) {
        if (essentialAlertEligibility.reason === "NO_PHONE") {
          skippedNoPhone += 1;
          results.push({
            studentId: student.id,
            studentName: name,
            kind: "ABSENT",
            ok: false,
            skipped: true,
            skipReason: "NO_PHONE",
            essentialAlertEligibility: essentialAlertEligibility.reason,
            error: "Guardian phone is missing.",
          });
        } else {
          skippedNoOptIn += 1;
          results.push({
            studentId: student.id,
            studentName: name,
            kind: "ABSENT",
            ok: false,
            skipped: true,
            skipReason: "NO_SMS_OPT_IN",
            essentialAlertEligibility: essentialAlertEligibility.reason,
            error:
              essentialAlertEligibility.reason === "PHONE_CHANGED"
                ? "Guardian phone changed after enrollment. Essential School Alerts must be enabled again for the current phone."
                : "Guardian has not enabled Essential School Alerts for attendance.",
          });
        }
        continue;
      }

      const to = essentialAlertEligibility.phoneNorm;

      if (!to) {
        skippedNoPhone += 1;
        results.push({
          studentId: student.id,
          studentName: name,
          kind: "ABSENT",
          ok: false,
          skipped: true,
          skipReason: "NO_PHONE",
          essentialAlertEligibility: "NO_PHONE",
          error: "Guardian phone is missing.",
        });
        continue;
      }

      eligibleCount += 1;

      try {
        const smsResult = await sendSms({
          tenantId,
          actorId: ctx.userId,
          to,
          message: smsBody({
            schoolName,
            studentName: name,
            classLabel: label,
            date: dateStr,
          }),
          template: "ATTENDANCE_ABSENCE_ALERT",
          payload: {
            purpose: "attendance_absence_alert",
            studentId: student.id,
            studentName: name,
            classroomId,
            classLabel: label,
            date: dateStr,
            sessionId: session.id,
          },
        });

        if (smsResult.ok) {
          successCount += 1;
        } else {
          failedCount += 1;
        }

        results.push({
          studentId: student.id,
          studentName: name,
          kind: "ABSENT",
          ok: smsResult.ok,
          skipped: false,
          essentialAlertEligibility: "ELIGIBLE",
          to: smsResult.to ?? to,
          ...(smsResult.ok ? {} : { error: smsResult.error ?? "SMS was not accepted." }),
        });
      } catch (e) {
        failedCount += 1;
        results.push({
          studentId: student.id,
          studentName: name,
          kind: "ABSENT",
          ok: false,
          skipped: false,
          essentialAlertEligibility: "ELIGIBLE",
          to,
          error: e instanceof Error ? e.message : "Send failed.",
        });
      }
    }

    const absentCount = absentMarks.length;
    const skippedCount = skippedNoOptIn + skippedNoPhone + skippedNotActive;
    const sealedAt = successCount > 0 ? new Date() : null;

    const seal = await prisma.attendanceSession.updateMany({
      where: { id: session.id, tenantId },
      data: {
        notifiedAt: sealedAt,
        notifyingAt: null,
        notifiedByUserId: ctx.userId,
      },
    });

    if (seal.count !== 1) {
      throw new Error("ATTENDANCE_NOTIFICATION_SEAL_FAILED");
    }

    try {
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: ctx.userId,
          action: "ATTENDANCE_ABSENTEE_NOTIFY_ATTEMPTED",
          resource: "AttendanceSession",
          resourceId: session.id,
          metadata: {
            classroomId,
            date: dateStr,
            absentCount,
            eligibleCount,
            successCount,
            sentCount: successCount,
            failedCount,
            skippedCount,
            skippedNoOptIn,
            skippedNoPhone,
            skippedNotActive,
            eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
            essentialAlertPurpose: "STUDENT_ATTENDANCE",
            notificationClaim: "SESSION_NOTIFYING_AT",
            notificationSealed: sealedAt !== null,
            brand: "EDULIFEOS",
            smsTestMode: process.env.SMS_TEST_MODE === "true",
            results: results.map((r) => ({
              studentId: r.studentId,
              studentName: r.studentName,
              ok: r.ok,
              skipped: r.skipped,
              skipReason: r.skipReason ?? null,
              essentialAlertEligibility: r.essentialAlertEligibility ?? null,
              error: r.error ?? null,
            })),
          } as Prisma.JsonObject,
        },
      });
    } catch {
      // Do not block notification flow because audit failed.
    }

    return json(200, {
      ok: failedCount === 0,
      alreadyNotified: false,
      notifiedAt: sealedAt?.toISOString() ?? null,
      tenantId,
      classroomId,
      date: dateStr,
      sessionId: session.id,
      total: absentCount,
      absentCount,
      eligibleCount,
      successCount,
      sentCount: successCount,
      skippedCount,
      failedCount,
      skippedNoOptIn,
      skippedNotEnrolled: skippedNoOptIn,
      skippedNoPhone,
      skippedNotActive,
      eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
      essentialAlertPurpose: "STUDENT_ATTENDANCE",
      brand: "EDULIFEOS",
      testMode: process.env.SMS_TEST_MODE === "true",
      summaryText: `${successCount}/${absentCount} absentee alert(s) sent. ${skippedCount} skipped, ${failedCount} failed.`,
      results,
    });
  } catch (e) {
    const sealedAt = successCount > 0 ? new Date() : null;

    try {
      await prisma.attendanceSession.updateMany({
        where: { id: session.id, tenantId },
        data: {
          notifiedAt: sealedAt,
          notifyingAt: null,
          notifiedByUserId: ctx.userId,
        },
      });
    } catch {
      // Best effort: the session claim prevents immediate concurrent replay even if sealing fails.
    }

    return json(500, {
      ok: false,
      alreadyNotified: sealedAt !== null,
      notifiedAt: sealedAt?.toISOString() ?? null,
      error: e instanceof Error ? e.message : "Failed to notify parents. Please try again.",
      sessionId: session.id,
      eligibleCount,
      successCount,
      sentCount: successCount,
      failedCount,
      skippedNoOptIn,
      skippedNotEnrolled: skippedNoOptIn,
      skippedNoPhone,
      skippedNotActive,
      eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
      essentialAlertPurpose: "STUDENT_ATTENDANCE",
    });
  }
}
