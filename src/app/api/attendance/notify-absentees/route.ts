// src/app/api/attendance/notify-absentees/route.ts
import { NextResponse } from "next/server";
import { AttendanceStatus } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { sendSms } from "@/lib/sms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FEVER_THRESHOLD = 37.8;
const MAX_NOTIFICATIONS_PER_REQUEST = 120;

type NotifyRequestBody = {
  tenantId?: string; // legacy/back-compat only
  classroomId?: string;
  date?: string; // YYYY-MM-DD
  alerts?: Array<{ studentId?: string }>;
  studentIds?: string[];
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

  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid date.");
  }

  return d;
}

function normRole(v: unknown) {
  return clean(v).toUpperCase().replace(/\s+/g, "_");
}

function studentName(s: { firstName?: string | null; lastName?: string | null }) {
  return [s.firstName, s.lastName].map(clean).filter(Boolean).join(" ") || "Your child";
}

function guardianPhone(s: {
  guardianPhoneNorm?: string | null;
  guardianPhone?: string | null;
}) {
  return clean(s.guardianPhoneNorm) || clean(s.guardianPhone) || null;
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
      error: "classroomId and date are required",
    });
  }

  let date: Date;

  try {
    date = parseDateISO(dateStr);
  } catch (e) {
    return json(400, {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid date",
    });
  }

  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId },
    select: { id: true, name: true, grade: true, arm: true },
  });

  if (!classroom) {
    return json(404, { ok: false, error: "Classroom not found" });
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
    select: { id: true, isClosed: true, certifiedAt: true },
  });

  if (!session) {
    return json(400, {
      ok: false,
      error:
        "No attendance session found for this class/date. Open, mark, save, then close or certify before notifying.",
    });
  }

  const sessionState = session.certifiedAt
    ? "CERTIFIED"
    : session.isClosed
      ? "CLOSED"
      : "OPEN";

  if (sessionState !== "CLOSED" && sessionState !== "CERTIFIED") {
    return json(400, {
      ok: false,
      error: "Close or certify the session before notifying parents.",
      sessionState,
    });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });

  const ts = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { feverThreshold: true },
  });

  const feverThreshold =
    ts?.feverThreshold != null ? Number(ts.feverThreshold) : DEFAULT_FEVER_THRESHOLD;

  const filterIds = new Set<string>();

  for (const x of Array.isArray(body.studentIds) ? body.studentIds : []) {
    const id = clean(x);
    if (id) filterIds.add(id);
  }

  for (const alert of Array.isArray(body.alerts) ? body.alerts : []) {
    const id = clean(alert?.studentId);
    if (id) filterIds.add(id);
  }

  const hasFilter = filterIds.size > 0;

  const absentMarks = await prisma.attendanceMark.findMany({
    where: {
      sessionId: session.id,
      status: AttendanceStatus.ABSENT,
    },
    select: { studentId: true },
  });

  const absentIds = new Set(absentMarks.map((m) => m.studentId));

  const healthRows = await prisma.studentHealthDaily.findMany({
    where: { tenantId, classroomId, date },
    select: {
      studentId: true,
      temperatureC: true,
      symptoms: true,
    },
  });

  const feverByStudentId = new Map<
    string,
    { temp: number; symptoms?: string | null }
  >();

  for (const row of healthRows) {
    const temp = row.temperatureC != null ? Number(row.temperatureC) : NaN;

    if (Number.isFinite(temp) && temp >= feverThreshold) {
      feverByStudentId.set(row.studentId, {
        temp,
        symptoms: row.symptoms ?? null,
      });
    }
  }

  const candidateSet = new Set<string>([
    ...absentIds,
    ...feverByStudentId.keys(),
  ]);

  let candidateIds = Array.from(candidateSet);

  if (hasFilter) {
    candidateIds = candidateIds.filter((id) => filterIds.has(id));
  }

  if (!candidateIds.length) {
    return json(400, {
      ok: false,
      error: "No DB-verified absentees or fever cases to notify for this class/date.",
    });
  }

  if (candidateIds.length > MAX_NOTIFICATIONS_PER_REQUEST) {
    return json(400, {
      ok: false,
      error: `Too many notifications in one request. Maximum is ${MAX_NOTIFICATIONS_PER_REQUEST}.`,
    });
  }

  const students = await prisma.student.findMany({
    where: {
      tenantId,
      id: { in: candidateIds },
      status: "ACTIVE",
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      guardianPhone: true,
      guardianPhoneNorm: true,
    },
  });

  const studentById = new Map(students.map((s) => [s.id, s]));

  const classLabel =
    clean(classroom.name) ||
    [clean(classroom.grade), clean(classroom.arm)].filter(Boolean).join(" ") ||
    "your child's class";

  const results: Array<{
    studentId: string;
    studentName?: string;
    kind: "ABSENT" | "FEVER";
    ok: boolean;
    to?: string;
    error?: string;
  }> = [];

  let successCount = 0;

  for (const studentId of candidateIds) {
    const s = studentById.get(studentId);
    const fullName = s ? studentName(s) : "Your child";
    const to = s ? guardianPhone(s) : null;

    const isAbsent = absentIds.has(studentId);
    const fever = feverByStudentId.get(studentId);
    const kind: "ABSENT" | "FEVER" = isAbsent ? "ABSENT" : "FEVER";

    if (!s) {
      results.push({
        studentId,
        studentName: fullName,
        kind,
        ok: false,
        error: "Student is not active or does not belong to this tenant.",
      });
      continue;
    }

    if (!to) {
      results.push({
        studentId,
        studentName: fullName,
        kind,
        ok: false,
        error: "Guardian phone is missing.",
      });
      continue;
    }

    const schoolName = tenant?.name ?? "Your school";

    const line =
      kind === "ABSENT"
        ? `${fullName} was marked absent from ${classLabel} today (${dateStr}).`
        : `${fullName} recorded a temperature of ${Number(
            fever?.temp ?? 0
          ).toFixed(1)}°C in ${classLabel} today (${dateStr}).`;

    const symptoms = fever?.symptoms
      ? ` Reported symptoms: ${clean(fever.symptoms)}.`
      : "";

    const message =
      `${schoolName}: ${line}${symptoms} ` +
      "This message is for your awareness. Please contact the class teacher if needed.";

    try {
      const smsResult = await sendSms({
        tenantId,
        actorId: ctx.userId,
        to,
        message,
        template: "ATTENDANCE_HEALTH_ALERT",
        payload: {
          purpose: "attendance_health_alert",
          studentId,
          studentName: fullName,
          kind,
          temperatureC: kind === "FEVER" ? fever?.temp ?? null : null,
          classroomId,
          date: dateStr,
          sessionId: session.id,
        },
      });

      if (smsResult.ok) successCount++;

      results.push({
        studentId,
        studentName: fullName,
        kind,
        ok: smsResult.ok,
        to: smsResult.to ?? to,
        ...(smsResult.ok ? {} : { error: smsResult.error ?? "SMS was not accepted." }),
      });
    } catch (e) {
      results.push({
        studentId,
        studentName: fullName,
        kind,
        ok: false,
        to,
        error: e instanceof Error ? e.message : "Send failed",
      });
    }
  }

  try {
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: ctx.userId,
        action: "ATTENDANCE_NOTIFY_SENT",
        resource: "AttendanceSession",
        resourceId: session.id,
        metadata: {
          classroomId,
          date: dateStr,
          total: candidateIds.length,
          successCount,
          feverThreshold,
          brand: "EDULIFEOS",
          smsTestMode: process.env.SMS_TEST_MODE === "true",
        } as Prisma.JsonObject,
      },
    });
  } catch {}

  return json(200, {
    ok: successCount === results.length,
    tenantId,
    classroomId,
    date: dateStr,
    sessionId: session.id,
    feverThreshold,
    total: candidateIds.length,
    successCount,
    brand: "EDULIFEOS",
    results,
  });
}