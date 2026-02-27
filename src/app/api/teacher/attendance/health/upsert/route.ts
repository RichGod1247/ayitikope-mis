// src/app/api/teacher/attendance/health/upsert/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUserContext } from "@/lib/serverAuth";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { StudentStatus } from "@prisma/client";
import { effectiveRole } from "@/lib/roleRouting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RowSchema = z.object({
  studentId: z.string().min(1),
  temperatureC: z.union([z.number(), z.string()]).nullable().optional(),
  symptoms: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const BodySchema = z
  .object({
    sessionId: z.string().min(1),
    rows: z.array(RowSchema).optional(), // legacy
    items: z.array(RowSchema).optional(), // current client
    health: z.array(RowSchema).optional(), // legacy
  })
  .strict();

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

function dateOnlyUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function parseTemp(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  if (n < 30 || n > 45) return null;
  return Math.round(n * 10) / 10;
}

function clampText(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function isIdLike(id: string) {
  return /^[a-zA-Z0-9_-]{10,100}$/.test(id);
}

function isAdminLike(roleName: unknown) {
  const r = effectiveRole(roleName);
  return r === "SUPERADMIN" || r === "SCHOOL_ADMIN" || r === "HEADTEACHER";
}

export async function POST(req: NextRequest) {
  const auth = await requireApiUserContext(req, { requireTenant: true });
  if (!auth.ok) return auth.res;

  const ctx = { userId: auth.ctx.userId, tenantId: auth.ctx.tenantId };

  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    return noStoreJson(415, { ok: false, error: "Content-Type must be application/json." });
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return noStoreJson(400, { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid body." });
  }

  const sessionId = parsed.data.sessionId.trim();
  if (!isIdLike(sessionId)) return noStoreJson(400, { ok: false, error: "Invalid sessionId." });

  const rows = (parsed.data.items ?? parsed.data.rows ?? parsed.data.health ?? []) as z.infer<typeof RowSchema>[];

  const session = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: ctx.tenantId },
    select: {
      id: true,
      classroomId: true,
      date: true,
      notifiedAt: true,
      takenByUserId: true,
      isClosed: true,
      certifiedAt: true,
    },
  });

  if (!session) return noStoreJson(404, { ok: false, error: "Attendance session not found." });

  if (session.certifiedAt) {
    return noStoreJson(409, { ok: false, error: "Session is certified and cannot be edited." });
  }
  if (session.isClosed) {
    return noStoreJson(409, { ok: false, error: "Session is closed. Reopen it before editing." });
  }
  if (session.notifiedAt) {
    return noStoreJson(409, {
      ok: false,
      error: "Health is locked because parents have already been notified for this session.",
    });
  }

  try {
    await assertCanAccessClassroom({ ...ctx, classroomId: session.classroomId });
  } catch (e: any) {
    return noStoreJson(Number(e?.status) || 403, { ok: false, error: String(e?.message || "Forbidden.") });
  }

  // Prevent silent takeover for normal teachers (admins/headteachers can still oversee)
  const membership = await prisma.membership.findFirst({
    where: { tenantId: ctx.tenantId, userId: ctx.userId, status: "ACTIVE" },
    select: { role: { select: { name: true } } },
  });
  if (!membership) return noStoreJson(403, { ok: false, error: "FORBIDDEN" });

  const adminLike = isAdminLike(membership.role?.name);
  if (!adminLike && session.takenByUserId && session.takenByUserId !== ctx.userId) {
    return noStoreJson(403, { ok: false, error: "This session is owned by another user." });
  }

  const dateOnly = dateOnlyUTC(session.date);

  if (!rows.length) {
    return noStoreJson(200, { ok: true, count: 0, blockedStudentIds: [] });
  }

  const incomingIds = Array.from(new Set(rows.map((r) => String(r.studentId ?? "").trim()).filter(Boolean)));
  if (incomingIds.length === 0) {
    return noStoreJson(200, { ok: true, count: 0, blockedStudentIds: [] });
  }

  // ✅ Only ACTIVE students in this class are allowed
  const students = await prisma.student.findMany({
    where: {
      tenantId: ctx.tenantId,
      classroomId: session.classroomId,
      status: StudentStatus.ACTIVE,
      id: { in: incomingIds },
    },
    select: { id: true, healthConsentAt: true },
  });

  const allowedSet = new Set(students.map((s) => s.id));
  const consentSet = new Set(students.filter((s) => !!s.healthConsentAt).map((s) => s.id));

  const blockedStudentIds: string[] = [];
  const byStudent = new Map<
    string,
    { studentId: string; temperatureC: number | null; symptoms: string | null; notes: string | null }
  >();

  for (const r of rows) {
    const sid = String(r.studentId ?? "").trim();
    if (!sid) continue;

    // Ignore invalid / archived / wrong-class silently
    if (!allowedSet.has(sid)) continue;

    if (!consentSet.has(sid)) {
      blockedStudentIds.push(sid);
      continue;
    }

    byStudent.set(sid, {
      studentId: sid,
      temperatureC: parseTemp(r.temperatureC),
      symptoms: clampText(r.symptoms, 400),
      notes: clampText(r.notes, 600),
    });
  }

  const payloads = Array.from(byStudent.values());
  if (!payloads.length) {
    return noStoreJson(200, {
      ok: true,
      count: 0,
      blockedStudentIds: Array.from(new Set(blockedStudentIds)),
      note: blockedStudentIds.length ? "Health blocked for learners missing consent." : undefined,
    });
  }

  const ops = payloads.map((p) =>
    prisma.studentHealthDaily.upsert({
      where: { StudentHealthDaily_unique_student_date: { studentId: p.studentId, date: dateOnly } },
      create: {
        tenantId: ctx.tenantId,
        classroomId: session.classroomId,
        studentId: p.studentId,
        date: dateOnly,
        temperatureC: p.temperatureC as any,
        symptoms: p.symptoms,
        notes: p.notes,
      },
      update: {
        classroomId: session.classroomId,
        temperatureC: p.temperatureC as any,
        symptoms: p.symptoms,
        notes: p.notes,
      },
      select: { id: true },
    })
  );

  try {
    await prisma.$transaction(ops);
    const uniqueBlocked = Array.from(new Set(blockedStudentIds));
    return noStoreJson(200, {
      ok: true,
      count: payloads.length,
      blockedStudentIds: uniqueBlocked,
      note: uniqueBlocked.length ? "Some learners have no consent; their health was not saved." : undefined,
    });
  } catch (e: any) {
    console.error("[ATTENDANCE_HEALTH_UPSERT_ERROR]", e);
    return noStoreJson(500, { ok: false, error: "Failed to save health records. Please try again." });
  }
}