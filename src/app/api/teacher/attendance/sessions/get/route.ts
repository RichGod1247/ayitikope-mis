// src/app/api/teacher/attendance/sessions/get/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { AttendanceStatus } from "@prisma/client";
import { StudentStatus } from "@prisma/client";
import { z } from "zod";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { getGuardianEssentialAlertEligibilityMap } from "@/lib/essentialAlerts/enrollment";
import { resolveAttendanceCalendarDate } from "@/lib/server/attendanceAcademicCalendar";
import {
  requireTenantContext,
  assertTenantParamMatches,
  toHttpError,
} from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AttendanceDisplayStatus = AttendanceStatus | "UNMARKED";

const QuerySchema = z
  .object({
    sessionId: z.string().min(1, "Missing sessionId."),
    tenantId: z.string().optional(), // legacy compatibility only
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

function toISODateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function compactName(firstName?: string | null, lastName?: string | null) {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

const PRE_CERT_HOLIDAY_ROLES = new Set([
  "TEACHER",
  "SCHOOL_ADMIN",
  "HEADTEACHER",
  "SUPERADMIN",
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "OWNER",
]);

const CERTIFIED_HOLIDAY_ROLES = new Set([
  "SCHOOL_ADMIN",
  "HEADTEACHER",
  "SUPERADMIN",
  "SUPER_ADMIN",
  "SYSTEM_ADMIN",
  "OWNER",
]);

function normalizeRoleName(value: unknown) {
  const role = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");
  if (role === "ADMIN") return "SCHOOL_ADMIN";
  if (role === "HEADMASTER") return "HEADTEACHER";
  return role;
}

function canDeclarePreCertHoliday(value: unknown) {
  return PRE_CERT_HOLIDAY_ROLES.has(normalizeRoleName(value));
}

function canSupersedeCertifiedHoliday(value: unknown) {
  return CERTIFIED_HOLIDAY_ROLES.has(normalizeRoleName(value));
}

export async function GET(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const safe = { userId: ctx.userId, tenantId: ctx.tenantId };

    const url = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      sessionId: url.searchParams.get("sessionId") ?? "",
      tenantId: url.searchParams.get("tenantId") ?? undefined,
    });

    if (!parsed.success) {
      return noStoreJson(400, {
        ok: false,
        error: parsed.error.issues[0]?.message || "Invalid query.",
      });
    }

    const suppliedTenantId = parsed.data.tenantId?.trim() || null;
    assertTenantParamMatches(safe.tenantId, suppliedTenantId);

    const session = await prisma.attendanceSession.findFirst({
      where: {
        id: parsed.data.sessionId.trim(),
        tenantId: safe.tenantId,
      },
      select: {
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

    if (!session) {
      return noStoreJson(404, {
        ok: false,
        error: "Attendance session not found.",
      });
    }

    await assertCanAccessClassroom({
      ...safe,
      classroomId: session.classroomId,
    });

    const [[students, marks], academicCalendar, membership] = await Promise.all([
      prisma.$transaction([
        prisma.student.findMany({
          where: {
            tenantId: safe.tenantId,
            classroomId: session.classroomId,
            status: StudentStatus.ACTIVE,
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: {
            id: true,
            firstName: true,
            lastName: true,
            guardianName: true,
            guardianPhone: true,
            guardianPhoneNorm: true,
            healthConsentAt: true,
          },
        }),
        prisma.attendanceMark.findMany({
          where: { sessionId: session.id },
          select: {
            id: true,
            studentId: true,
            status: true,
            note: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
      ]),
      resolveAttendanceCalendarDate({
        tenantId: safe.tenantId,
        date: session.date,
      }),
      prisma.membership.findFirst({
        where: {
          tenantId: safe.tenantId,
          userId: safe.userId,
          status: "ACTIVE",
        },
        select: { role: { select: { name: true } } },
      }),
    ]);

    const guardianEligibilityByStudent =
      await getGuardianEssentialAlertEligibilityMap({
        tenantId: safe.tenantId,
        purpose: "STUDENT_ATTENDANCE",
        students: students.map((student) => ({
          id: student.id,
          guardianPhone: student.guardianPhone,
          guardianPhoneNorm: student.guardianPhoneNorm,
        })),
      });

    const marksByStudent = new Map(
      marks.map((mark) => [
        mark.studentId,
        {
          id: mark.id,
          status: mark.status,
          note: mark.note ?? null,
          createdAt: mark.createdAt.toISOString(),
          updatedAt: mark.updatedAt.toISOString(),
        },
      ]),
    );

    const dateISO = toISODateOnly(session.date);

    const classroom = session.classroom
      ? {
          id: session.classroom.id,
          name: session.classroom.name,
          grade: session.classroom.grade,
          arm: session.classroom.arm,
        }
      : null;

    const classLabel = [
      session.classroom?.name ?? "Class",
      session.classroom?.grade
        ? `${session.classroom.grade}${session.classroom.arm ? ` ${session.classroom.arm}` : ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" ");

    let present = 0;
    let absent = 0;
    let late = 0;
    let excused = 0;
    let unmarked = 0;

    const studentRows = students.map((student) => {
      const mark = marksByStudent.get(student.id) ?? null;
      const status: AttendanceDisplayStatus = mark?.status ?? "UNMARKED";
      const essentialAlertEligibility =
        guardianEligibilityByStudent.get(student.id) ?? {
          eligible: false,
          reason: "NOT_ENROLLED" as const,
          phoneNorm: null,
          enrollmentStatus: null,
        };

      if (status === "PRESENT") present += 1;
      else if (status === "ABSENT") absent += 1;
      else if (status === "LATE") late += 1;
      else if (status === "EXCUSED") excused += 1;
      else unmarked += 1;

      return {
        id: student.id,
        firstName: student.firstName ?? "",
        lastName: student.lastName ?? "",
        name:
          compactName(student.firstName, student.lastName) || "Unnamed learner",
        guardianName: student.guardianName ?? null,
        guardianPhone: student.guardianPhone ?? null,
        essentialAlertSmsEligible: essentialAlertEligibility.eligible,
        essentialAlertEligibility: essentialAlertEligibility.reason,
        eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT" as const,
        essentialAlertPurpose: "STUDENT_ATTENDANCE" as const,
        healthConsentAt: student.healthConsentAt
          ? student.healthConsentAt.toISOString()
          : null,

        attendance: {
          markId: mark?.id ?? null,
          isMarked: !!mark,
          status,
          note: mark?.note ?? null,
          createdAt: mark?.createdAt ?? null,
          updatedAt: mark?.updatedAt ?? null,
        },

        // Compatibility shell only.
        // Manual attendance must not capture health in C.1.
        health: {
          enabled: false,
          temperatureC: null,
          symptoms: null,
          notes: null,
          sentToParentAt: null,
        },
      };
    });

    const roleName = normalizeRoleName(membership?.role?.name);
    const certifiedHolidayAuthority = canSupersedeCertifiedHoliday(roleName);
    const ownerOrAdmin =
      certifiedHolidayAuthority ||
      !session.takenByUserId ||
      session.takenByUserId === safe.userId;

    return noStoreJson(200, {
      ok: true,
      mode: "ATTENDANCE_ONLY",
      healthCaptureEnabled: false,
      eligibilityAuthority: "ESSENTIAL_ALERT_ENROLLMENT",
      essentialAlertPurpose: "STUDENT_ATTENDANCE",
      session: {
        id: session.id,
        tenantId: session.tenantId,
        classroomId: session.classroomId,
        date: dateISO,
        dateISO,
        isClosed: session.isClosed,
        closedAt: session.closedAt ? session.closedAt.toISOString() : null,
        certifiedAt: session.certifiedAt
          ? session.certifiedAt.toISOString()
          : null,
        certifiedByUserId: session.certifiedByUserId ?? null,
        takenByUserId: session.takenByUserId ?? null,
        isHoliday: session.isHoliday,
        holidayReason: session.holidayReason ?? null,
        holidayDeclaredAt: session.holidayDeclaredAt
          ? session.holidayDeclaredAt.toISOString()
          : null,
        holidayDeclaredByUserId: session.holidayDeclaredByUserId ?? null,
      },
      holidayAuthority: {
        roleName,
        canDeclareBeforeCertification:
          canDeclarePreCertHoliday(roleName) && ownerOrAdmin && !session.certifiedAt,
        canSupersedeCertified: certifiedHolidayAuthority && !!session.certifiedAt,
      },
      classroom,
      classLabel,
      academicCalendar: {
        ...academicCalendar.calendar,
        ...academicCalendar.date,
      },
      summary: {
        students: students.length,
        total: students.length,
        marked: students.length - unmarked,
        unmarked,
        present,
        absent,
        late,
        excused,
      },
      students: studentRows,
    });
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return noStoreJson(status, { ok: false, error: msg });
  }
}
