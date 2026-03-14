// src/app/api/teacher/attendance/notify-parents/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { z } from "zod";
import { sendViaHubtel, BrandName } from "@/lib/sms/hubtel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    sessionId: z.string().min(1, "sessionId is required."),
    brand: z.string().optional(),
  })
  .strict();

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function jsonErr(status: number, error: string, extra?: Record<string, any>) {
  return json(status, { ok: false, error, ...(extra ?? {}) });
}

const FEVER_THRESHOLD = 37.8;
const ADMIN_ROLES = new Set(["SCHOOL_ADMIN", "HEADTEACHER"]);
const LOCK_TTL_MINUTES = 8;

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isUuidLike(id: string) {
  return /^[0-9a-fA-F-]{16,64}$/.test(id);
}

function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.replace(/\s+/g, "").replace(/-/g, "");
  if (!raw) return null;

  if (raw.startsWith("+") && raw.length >= 9) return raw;
  if (raw.startsWith("233") && raw.length >= 12) return `+${raw}`;
  if (raw.startsWith("0") && raw.length === 10) return `+233${raw.slice(1)}`;

  return raw.length >= 8 ? raw : null;
}

function resolveBrand(input?: string) {
  const s = String(input ?? "").trim().toUpperCase();
  if (!s) return "EDULIFEOS" as (typeof BrandName)[number];
  if (s === "EDULIFE") return "EDULIFEOS" as (typeof BrandName)[number];
  if (BrandName.includes(s as (typeof BrandName)[number])) {
    return s as (typeof BrandName)[number];
  }
  return "EDULIFEOS" as (typeof BrandName)[number];
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === "object" && v && typeof (v as any).toNumber === "function") {
    const n = (v as any).toNumber();
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  }
  const n = Number(v as any);
  return Number.isFinite(n) ? n : null;
}

function dateOnlyUTCFromISO(dateISO: string) {
  return new Date(Date.UTC(Number(dateISO.slice(0, 4)), Number(dateISO.slice(5, 7)) - 1, Number(dateISO.slice(8, 10))));
}

function formatTempC(n: number | null) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "";
  return `${Math.round(n * 10) / 10}C`;
}

function normalizeKey(s: string) {
  return String(s ?? "").trim().toUpperCase();
}
function normalizeClassKey(s: string) {
  return normalizeKey(s).replace(/\s+/g, "");
}
type JhsAssignmentRow = { subject: string; classes: string[] };
function parseJhsAssignmentRows(j: any): JhsAssignmentRow[] {
  if (!Array.isArray(j)) return [];
  const rows: JhsAssignmentRow[] = [];
  for (const row of j) {
    const subject = typeof row?.subject === "string" ? row.subject.trim() : "";
    const classesRaw = row?.classes;
    const classes = Array.isArray(classesRaw)
      ? classesRaw.map((c: any) => (typeof c === "string" ? c.trim() : "")).filter(Boolean)
      : [];
    if (!subject || classes.length === 0) continue;
    rows.push({ subject, classes: Array.from(new Set(classes)) });
  }
  return rows;
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  const safe = { userId: auth.ctx.userId, tenantId: auth.ctx.tenantId };

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return jsonErr(415, "Content-Type must be application/json.");
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonErr(400, parsed.error.issues[0]?.message || "Invalid request body.");
  }

  const sessionId = parsed.data.sessionId.trim();
  if (!sessionId || !isUuidLike(sessionId)) {
    return jsonErr(400, "Invalid sessionId.");
  }

  const brand = resolveBrand(parsed.data.brand);

  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId: safe.userId, tenantId: safe.tenantId } },
    select: { status: true, role: { select: { name: true } } },
  });
  if (!membership || membership.status !== "ACTIVE") {
    return jsonErr(403, "Forbidden (membership inactive).");
  }

  const roleName = (membership.role?.name ?? "").trim();
  const isAdmin = ADMIN_ROLES.has(roleName) || roleName.toUpperCase().includes("ADMIN") || roleName.toUpperCase().includes("HEAD");

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

      classroom: { select: { name: true, grade: true, arm: true } },
      marks: {
        select: {
          studentId: true,
          status: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
              guardianName: true,
              guardianPhone: true,
              guardianSmsOptIn: true,
              healthConsentAt: true,
            },
          },
        },
      },
    },
  });

  if (!session) return jsonErr(404, "Session not found.");

  const isSessionOwner =
    (!!session.takenByUserId && session.takenByUserId === safe.userId) ||
    (!!session.certifiedByUserId && session.certifiedByUserId === safe.userId);

  let classMatches = false;

  if (!isAdmin && !isSessionOwner) {
    const tp = await prisma.teacherProfile.findFirst({
      where: { tenantId: safe.tenantId, userId: safe.userId },
      select: { primaryClassroomId: true, phase: true, jhsAssignments: true },
    });

    if (tp?.primaryClassroomId) {
      classMatches = session.classroomId === tp.primaryClassroomId;
    }

    if (!classMatches && tp?.phase === "JHS" && tp?.jhsAssignments) {
      const rows = parseJhsAssignmentRows(tp.jhsAssignments);
      const gradeKeyA = normalizeKey(session.classroom?.grade ?? "");
      const nameKeyA = normalizeKey(session.classroom?.name ?? "");
      const gradeKeyB = normalizeClassKey(session.classroom?.grade ?? "");
      const nameKeyB = normalizeClassKey(session.classroom?.name ?? "");

      classMatches = rows.some((r) => {
        const clsKeysA = r.classes.map((c) => normalizeKey(c));
        const clsKeysB = r.classes.map((c) => normalizeClassKey(c));
        return (
          clsKeysA.includes(gradeKeyA) ||
          clsKeysA.includes(nameKeyA) ||
          clsKeysB.includes(gradeKeyB) ||
          clsKeysB.includes(nameKeyB)
        );
      });
    }

    if (!tp?.primaryClassroomId && !classMatches) return jsonErr(403, "No primary class assigned.");
  }

  if (!(isAdmin || isSessionOwner || classMatches)) {
    return jsonErr(403, "Forbidden (classroom access denied).");
  }

  if (!session.isClosed && !session.certifiedAt) {
    return jsonErr(409, "Close (or certify) the session before notifying parents.");
  }

  if (session.notifiedAt) {
    return json(200, { ok: true, alreadyNotified: true, notifiedAt: session.notifiedAt, brand });
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

  if (claim.count === 0) {
    const s = await prisma.attendanceSession.findFirst({
      where: { id: session.id, tenantId: safe.tenantId },
      select: { notifiedAt: true, notifyingAt: true },
    });

    if (s?.notifiedAt) {
      return json(200, { ok: true, alreadyNotified: true, notifiedAt: s.notifiedAt, brand });
    }

    if (s?.notifyingAt) {
      return json(409, { ok: false, inProgress: true, error: "Notification already in progress. Please wait." });
    }

    return jsonErr(409, "Session not eligible for notification right now.");
  }

  const dateISO = session.date.toISOString().slice(0, 10);
  const dateObj = dateOnlyUTCFromISO(dateISO);

  const classLabel =
    [
      session.classroom?.name ?? null,
      session.classroom?.grade
        ? `${session.classroom.grade}${session.classroom.arm ? ` ${session.classroom.arm}` : ""}`
        : null,
    ]
      .filter(Boolean)
      .join(" ")
      .trim() || "Class";

  const healthRows = await prisma.studentHealthDaily.findMany({
    where: { tenantId: safe.tenantId, classroomId: session.classroomId, date: dateObj },
    select: { studentId: true, temperatureC: true, symptoms: true },
  });

  const healthByStudent = new Map(healthRows.map((h) => [h.studentId, h]));

  const alerts = session.marks
    .map((m) => {
      const studentName = [m.student.firstName, m.student.lastName].filter(Boolean).join(" ").trim() || "Learner";
      const phone = normalizePhone(m.student.guardianPhone);
      const optIn = !!m.student.guardianSmsOptIn;

      const health = healthByStudent.get(m.studentId);
      const tempN = toNumber((health as any)?.temperatureC);
      const hasConsent = !!m.student.healthConsentAt;

      const hasFever = typeof tempN === "number" && tempN >= FEVER_THRESHOLD;
      const isAbsent = m.status === "ABSENT";

      const qualifies = (isAbsent && optIn) || (hasFever && optIn && hasConsent);
      if (!qualifies || !phone) return null;

      return {
        studentId: m.studentId,
        studentName,
        toPhone: phone,
        isAbsent,
        hasFever: hasFever && hasConsent,
        temperatureC: hasConsent ? tempN : null,
        symptoms: hasConsent ? ((health as any)?.symptoms ?? null) : null,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);

  if (!alerts.length) {
    await prisma.attendanceSession.update({
      where: { id: session.id },
      data: { notifyingAt: null },
    });

    return json(200, {
      ok: true,
      brand,
      total: 0,
      successCount: 0,
      testMode: false,
      note: "No eligible alerts (missing opt-in/phone/consent or no absences/fever).",
    });
  }

  const testTo = safeTrim(process.env.TEST_SMS_TO);
  const testMode = !!testTo;

  let successCount = 0;
  const feverStudentIdsToStamp: string[] = [];

  try {
    for (const a of alerts) {
      const to = testMode ? testTo : a.toPhone;
      if (!to) continue;

      const tempText = formatTempC(a.temperatureC);

      const bodyText = a.isAbsent
        ? `${a.studentName} was marked ABSENT in ${classLabel} on ${dateISO}. If this is incorrect, please contact the school.`
        : `${a.studentName} recorded ${tempText} in ${classLabel} on ${dateISO}. Please monitor and contact the school if needed.`;

      const log = await prisma.smsLog.create({
        data: {
          to,
          from: brand,
          body: bodyText,
          brand,
          tenantId: safe.tenantId,
          actorId: safe.userId,
        },
      });

      try {
        const res: any = await sendViaHubtel({
          to,
          body: bodyText,
          brand,
          meta: {
            purpose: "attendance-alert",
            sessionId: session.id,
            classroomId: session.classroomId,
            studentId: a.studentId,
            dateISO,
            testMode,
          },
        });

        await prisma.smsLog.update({
          where: { id: log.id },
          data: {
            providerMessageId: res?.messageId ?? res?.message_id ?? res?.id ?? null,
            providerStatus: typeof res?.status === "number" ? res.status : null,
            providerStatusDescription: res?.statusDescription ?? res?.status_description ?? null,
            providerRaw: res ?? null,
          },
        });

        successCount += 1;
        if (a.hasFever) feverStudentIdsToStamp.push(a.studentId);
      } catch (err: any) {
        await prisma.smsLog.update({
          where: { id: log.id },
          data: {
            providerStatusDescription: err?.message ?? "SMS send failed",
            providerRaw: { error: err?.message ?? String(err) } as any,
          },
        });
      }
    }

    if (feverStudentIdsToStamp.length > 0) {
      await prisma.studentHealthDaily.updateMany({
        where: {
          tenantId: safe.tenantId,
          classroomId: session.classroomId,
          date: dateObj,
          studentId: { in: Array.from(new Set(feverStudentIdsToStamp)) },
          sentToParentAt: null,
        },
        data: { sentToParentAt: new Date() },
      });
    }

    await prisma.attendanceSession.update({
      where: { id: session.id },
      data: {
        notifiedAt: successCount > 0 ? new Date() : null,
        notifyingAt: null,
      },
    });

    return json(200, { ok: true, brand, testMode, total: alerts.length, successCount });
  } catch (e) {
    await prisma.attendanceSession.update({
      where: { id: session.id },
      data: { notifyingAt: null },
    });

    console.error("[ATTENDANCE_NOTIFY_PARENTS_ERROR]", e);
    return jsonErr(500, "Failed to notify parents. Please try again.");
  }
}