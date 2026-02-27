// src/app/api/teacher/attendance/marks/upsert/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertCanAccessClassroom } from "@/lib/teacherClassroomAccess";
import { AttendanceStatus, StudentStatus } from "@prisma/client";
import { z } from "zod";
import { requireTenantContext, assertTenantParamMatches, toHttpError } from "@/lib/server/tenantScope";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

const STATUS = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

const ItemSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(STATUS),
  note: z.string().optional().nullable(),
});

const BodySchema = z
  .object({
    tenantId: z.string().optional(), // legacy compat
    sessionId: z.string().min(1),
    items: z.array(ItemSchema).min(1).max(800, "Too many items."),
  })
  .strict();

function isIdLike(id: string) {
  return /^[a-zA-Z0-9_-]{10,100}$/.test(id);
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

    const { sessionId, items, tenantId: tenantIdParam } = parsed.data;

    const sessionIdClean = sessionId.trim();
    if (!isIdLike(sessionIdClean)) return noStoreJson(400, { ok: false, error: "Invalid sessionId." });

    // Backward compat: if tenantId provided, must match session tenant
    const suppliedTenantId = tenantIdParam ? String(tenantIdParam).trim() || null : null;
    assertTenantParamMatches(safe.tenantId, suppliedTenantId);

    // Dedupe by studentId (last write wins)
    const byStudent = new Map<string, { status: (typeof STATUS)[number]; note: string | null }>();
    for (const it of items) {
      const sid = it.studentId.trim();
      if (!sid) continue;
      const note = typeof it.note === "string" ? it.note.trim() || null : null;
      byStudent.set(sid, { status: it.status, note });
    }

    const studentIds = Array.from(byStudent.keys());
    if (studentIds.length === 0) return noStoreJson(400, { ok: false, error: "No valid students provided." });

    const session = await prisma.attendanceSession.findFirst({
      where: { id: sessionIdClean, tenantId: safe.tenantId },
      select: {
        id: true,
        classroomId: true,
        isClosed: true,
        certifiedAt: true,
        takenByUserId: true,
      },
    });

    if (!session) return noStoreJson(404, { ok: false, error: "Session not found." });
    if (session.certifiedAt) return noStoreJson(409, { ok: false, error: "Session is certified and cannot be edited." });
    if (session.isClosed) return noStoreJson(409, { ok: false, error: "Session is closed. Reopen it before editing." });

    await assertCanAccessClassroom({ ...safe, classroomId: session.classroomId });

    if (session.takenByUserId && session.takenByUserId !== safe.userId) {
      return noStoreJson(403, { ok: false, error: "This session is owned by another user." });
    }

    // ✅ Only ACTIVE students in this class are valid
    const allowed = await prisma.student.findMany({
      where: {
        tenantId: safe.tenantId,
        classroomId: session.classroomId,
        status: StudentStatus.ACTIVE,
        id: { in: studentIds },
      },
      select: { id: true },
    });

    if (allowed.length !== studentIds.length) {
      return noStoreJson(400, {
        ok: false,
        error: "One or more learners do not belong to this class (or are archived).",
      });
    }

    const rows = studentIds.map((studentId) => {
      const v = byStudent.get(studentId)!;
      return {
        sessionId: session.id,
        studentId,
        status: v.status as unknown as AttendanceStatus,
        note: v.note,
      };
    });

    await prisma.$transaction(async (tx) => {
      await tx.attendanceMark.deleteMany({ where: { sessionId: session.id, studentId: { in: studentIds } } });
      await tx.attendanceMark.createMany({ data: rows });
    });

    return noStoreJson(200, { ok: true, count: rows.length });
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return noStoreJson(status, { ok: false, error: msg });
  }
}