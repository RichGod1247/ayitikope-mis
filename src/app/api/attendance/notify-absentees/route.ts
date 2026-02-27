// src/app/api/attendance/notify-absentees/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { sendViaHubtel, type BrandName } from "@/lib/sms/hubtel";
import { AttendanceStatus } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_FEVER_THRESHOLD = 37.8;
const MAX_NOTIFICATIONS_PER_REQUEST = 120;

type NotifyRequestBody = {
  tenantId?: string; // legacy/back-compat only
  classroomId?: string;
  date?: string; // YYYY-MM-DD
  // Back-compat: older client sends alerts. We'll accept studentIds as an optional filter only.
  alerts?: Array<{ studentId?: string }>;
  studentIds?: string[];
};

function json(status: number, payload: any) {
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Invalid date. Use YYYY-MM-DD.");
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error("Invalid date.");
  return d;
}

function normRole(v: unknown) {
  return clean(v).toUpperCase().replace(/\s+/g, "_");
}

export async function POST(request: Request) {
  // ✅ API auth: NEVER redirects
  const auth = await requireApiUserContext(request, {
    requireTenant: true,
    requireRoleNames: ["TEACHER", "HEADTEACHER", "SCHOOL_ADMIN", "SUPERADMIN"],
  });
  if (!auth.ok) return auth.res;

  const ctx = auth.ctx;
  const roleName = normRole(ctx.roleName);

  const body = (await request.json().catch(() => ({}))) as NotifyRequestBody;

  // Legacy tenantId param must match session tenant
  const tenantIdFromClient = clean(body.tenantId);
  if (tenantIdFromClient && tenantIdFromClient !== ctx.tenantId) {
    return json(403, { ok: false, error: "FORBIDDEN_TENANT_MISMATCH" });
  }

  const tenantId = ctx.tenantId;
  const classroomId = clean(body.classroomId);
  const dateStr = clean(body.date);

  if (!classroomId || !dateStr) {
    return json(400, { ok: false, error: "classroomId and date are required" });
  }

  let date: Date;
  try {
    date = parseDateISO(dateStr);
  } catch (e: any) {
    return json(400, { ok: false, error: String(e?.message || "Invalid date") });
  }

  // ✅ Classroom must exist in tenant
  const classroom = await prisma.classroom.findFirst({
    where: { id: classroomId, tenantId },
    select: { id: true, name: true, grade: true },
  });
  if (!classroom) return json(404, { ok: false, error: "Classroom not found" });

  // ✅ TEACHER must be assigned; admin/headteacher can oversee
  if (roleName === "TEACHER") {
    try {
      await assertCanAccessClassroom({ userId: ctx.userId, tenantId, classroomId });
    } catch (e: any) {
      return json(Number(e?.status) || 403, { ok: false, error: String(e?.message || "FORBIDDEN") });
    }
  }

  // ✅ Session must exist AND be CLOSED or CERTIFIED
  const session = await prisma.attendanceSession.findFirst({
    where: { tenantId, classroomId, date },
    orderBy: { createdAt: "desc" },
    select: { id: true, isClosed: true, certifiedAt: true },
  });

  if (!session) {
    return json(400, {
      ok: false,
      error:
        "No attendance session found for this class/date. Open, mark, SAVE, then CLOSE (or CERTIFY) before notifying.",
    });
  }

  const sessionState = session.certifiedAt ? "CERTIFIED" : session.isClosed ? "CLOSED" : "OPEN";
  if (sessionState !== "CLOSED" && sessionState !== "CERTIFIED") {
    return json(400, {
      ok: false,
      error: "CLOSE (or CERTIFY) the session before notifying parents.",
      sessionState,
    });
  }

  // ✅ Fever threshold from tenant settings (fallback)
  const ts = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: { feverThreshold: true },
  });
  const feverThreshold =
    ts?.feverThreshold != null ? Number(ts.feverThreshold) : DEFAULT_FEVER_THRESHOLD;

  // Optional filter list (back-compat)
  const filterIds = new Set<string>();
  const ids1 = Array.isArray(body.studentIds) ? body.studentIds : [];
  for (const x of ids1) {
    const id = clean(x);
    if (id) filterIds.add(id);
  }
  const alerts = Array.isArray(body.alerts) ? body.alerts : [];
  for (const a of alerts) {
    const id = clean(a?.studentId);
    if (id) filterIds.add(id);
  }
  const hasFilter = filterIds.size > 0;

  // 1) DB-derived absentees
  const absentMarks = await prisma.attendanceMark.findMany({
    where: { sessionId: session.id, status: AttendanceStatus.ABSENT },
    select: { studentId: true },
  });
  const absentIds = new Set(absentMarks.map((m) => m.studentId));

  // 2) DB-derived fever cases
  const healthRows = await prisma.studentHealthDaily.findMany({
    where: { tenantId, classroomId, date },
    select: { studentId: true, temperatureC: true, symptoms: true },
  });

  const feverByStudentId = new Map<string, { temp: number; symptoms?: string | null }>();
  for (const r of healthRows) {
    const t = r.temperatureC != null ? Number(r.temperatureC) : NaN;
    if (Number.isFinite(t) && t >= feverThreshold) {
      feverByStudentId.set(r.studentId, { temp: t, symptoms: r.symptoms ?? null });
    }
  }

  // Union of absent + fever
  const candidateSet = new Set<string>([...absentIds, ...feverByStudentId.keys()]);
  let candidateIds = Array.from(candidateSet);
  if (hasFilter) candidateIds = candidateIds.filter((id) => filterIds.has(id));

  if (!candidateIds.length) {
    return json(400, {
      ok: false,
      error: "No DB-verified absentees or fever cases to notify for this class/date.",
    });
  }

  if (candidateIds.length > MAX_NOTIFICATIONS_PER_REQUEST) {
    return json(400, {
      ok: false,
      error: `Too many notifications in one request (max ${MAX_NOTIFICATIONS_PER_REQUEST}).`,
    });
  }

  // Fetch names (no relation fields required)
  const students = await prisma.student.findMany({
    where: { tenantId, id: { in: candidateIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const nameById = new Map(
    students.map((s) => [
      s.id,
      `${clean(s.firstName)} ${clean(s.lastName)}`.trim() || "Your child",
    ])
  );

  // Safe mode routing
  const TEST_SMS_TO = process.env.TEST_SMS_TO || "";
  if (!TEST_SMS_TO) return json(500, { ok: false, error: "TEST_SMS_TO is not configured in env." });

  const brand: BrandName = "AYITIKOPJHS";
  const classLabel = clean(classroom.name) || clean(classroom.grade) || "your child's class";

  const results: Array<{
    studentId: string;
    kind: "ABSENT" | "FEVER";
    ok: boolean;
    to?: string;
    error?: string;
  }> = [];

  let successCount = 0;

  for (const studentId of candidateIds) {
    const fullName = nameById.get(studentId) || "Your child";
    const isAbsent = absentIds.has(studentId);
    const fever = feverByStudentId.get(studentId);

    const kind: "ABSENT" | "FEVER" = isAbsent ? "ABSENT" : "FEVER";

    const base = "Dear Parent/Guardian, this is Ayitikope M/A Basic School.";
    const closing =
      " This message is for your awareness only. Please check on your child and contact the class teacher if needed. Thank you.";

    const line =
      kind === "ABSENT"
        ? `${fullName} was ABSENT from ${classLabel} today (${dateStr}).`
        : `${fullName} was present but recorded a temperature of ${Number(
            fever?.temp ?? 0
          ).toFixed(1)} deg C in ${classLabel} on ${dateStr}.`;

    const symptoms = fever?.symptoms ? ` Reported symptoms: ${clean(fever.symptoms)}.` : "";
    const bodyText = `${base} ${line}${symptoms}${closing}`;

    try {
      const sendResult = await sendViaHubtel({
        to: TEST_SMS_TO,
        body: bodyText,
        tenantId,
        brand,
        meta: {
          purpose: "attendance_health_alert",
          type: "ATTENDANCE_HEALTH",
          studentId,
          studentName: fullName,
          kind,
          temperatureC: kind === "FEVER" ? fever?.temp ?? null : null,
          classroomId,
          date: dateStr,
          sessionId: session.id,
        },
      });

      if (sendResult.ok) successCount += 1;
      results.push({ studentId, kind, ok: sendResult.ok, to: sendResult.to });
    } catch (e: any) {
      results.push({ studentId, kind, ok: false, error: String(e?.message || "Send failed") });
    }
  }

  // Best-effort audit (do not block notify if audit fails)
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
          mode: "TEST_SMS_TO",
        } as any,
      },
    });
  } catch {}

  return json(200, {
    ok: true,
    tenantId,
    classroomId,
    date: dateStr,
    sessionId: session.id,
    feverThreshold,
    total: candidateIds.length,
    successCount,
    brand,
    results,
  });
}
