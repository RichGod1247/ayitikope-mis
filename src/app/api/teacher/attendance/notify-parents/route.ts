// src/app/api/teacher/attendance/notify-parents/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";

export const dynamic = "force-dynamic";

function jsonError(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
}

const FEVER_THRESHOLD = 37.8;

function safePhone(x: string | null | undefined): string | null {
  if (!x) return null;
  const s = x.trim();
  return s.length >= 8 ? s : null;
}

export async function POST(req: Request) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return jsonError(401, "Unauthorized");
  }

  const body = (await req.json().catch(() => null)) as
    | { sessionId?: string; brand?: string }
    | null;

  const sessionId = body?.sessionId?.trim();
  const brand = (body?.brand?.trim() || "EDULIFE").slice(0, 20);

  if (!sessionId) return jsonError(400, "Missing sessionId.");

  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: safe.tenantId },
    select: {
      id: true,
      tenantId: true,
      classroomId: true,
      date: true,
      isClosed: true,
      certifiedAt: true,
      classroom: { select: { name: true, grade: true, arm: true } },
      marks: {
        select: {
          studentId: true,
          status: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
              guardianPhone: true,
              guardianSmsOptIn: true,
              healthConsentAt: true,
            },
          },
        },
      },
    },
  });

  if (!session) return jsonError(404, "Session not found.");
  if (!session.isClosed && !session.certifiedAt) {
    return jsonError(409, "Close (or certify) the session before notifying parents.");
  }

  const dateISO = session.date.toISOString().slice(0, 10);
  const dateObj = new Date(`${dateISO}T00:00:00.000Z`);

  const classLabel = [
    session.classroom?.name,
    session.classroom?.grade ? `${session.classroom.grade}${session.classroom.arm ? " " + session.classroom.arm : ""}` : null,
  ]
    .filter(Boolean)
    .join(" ");

  // Pull health rows for fever checks
  const healthRows = await prisma.studentHealthDaily.findMany({
    where: { tenantId: safe.tenantId, classroomId: session.classroomId, date: dateObj },
    select: { studentId: true, temperatureC: true, symptoms: true },
  });
  const healthByStudent = new Map(healthRows.map((h) => [h.studentId, h]));

  // Build alerts: absentees OR fever (with consent)
  const alerts = session.marks
    .map((m) => {
      const studentName = [m.student.firstName, m.student.lastName].filter(Boolean).join(" ").trim();
      const phone = safePhone(m.student.guardianPhone);
      const optIn = !!m.student.guardianSmsOptIn;

      const health = healthByStudent.get(m.studentId) as
        | { studentId: string; temperatureC: number | null; symptoms: string | null }
        | undefined;

      const hasFever =
        typeof health?.temperatureC === "number" && health.temperatureC >= FEVER_THRESHOLD;

      const hasConsent = !!m.student.healthConsentAt;

      const isAbsent = m.status === "ABSENT";

      // Fever requires consent, absentee does not (still requires SMS opt-in).
      const qualifies =
        (isAbsent && optIn) || (hasFever && optIn && hasConsent);

      return qualifies
        ? {
            studentId: m.studentId,
            studentName,
            toPhone: phone,
            isAbsent,
            hasFever: hasFever && hasConsent,
            temperatureC: hasConsent ? health?.temperatureC ?? null : null,
            symptoms: hasConsent ? health?.symptoms ?? null : null,
          }
        : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  if (!alerts.length) {
    return NextResponse.json({ ok: true, total: 0, successCount: 0, brand, note: "No eligible alerts." });
  }

  // TEST mode support
  const testTo = process.env.TEST_SMS_TO?.trim();
  const testMode = !!testTo;

  // Create SmsLog entries (your actual provider sender can pick these up later)
  let successCount = 0;

  for (const a of alerts) {
    const to = testMode ? testTo! : a.toPhone;
    if (!to) continue;

    const bodyText = a.isAbsent
      ? `${a.studentName} was marked ABSENT in ${classLabel} on ${dateISO}. If this is incorrect, please contact the school.`
      : `${a.studentName} recorded ${a.temperatureC ?? ""}°C in ${classLabel} on ${dateISO}. Please monitor and contact the school if needed.`;

    await prisma.smsLog.create({
      data: {
        to,
        from: brand,
        body: bodyText,
        brand,
        tenantId: safe.tenantId,
        actorId: safe.userId,
      },
    });

    successCount++;
  }

  return NextResponse.json({
    ok: true,
    brand,
    testMode,
    total: alerts.length,
    successCount,
  });
}
