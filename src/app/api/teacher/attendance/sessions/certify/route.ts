// src/app/api/teacher/attendance/sessions/certify/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
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
    sessionId: z.string().min(1, "sessionId is required."),
    tenantId: z.string().optional(), // legacy
  })
  .strict();

function jsonErr(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

function isoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function isoOrNull(d: Date | null | undefined) {
  return d ? d.toISOString() : null;
}

const sessionSelect = {
  id: true,
  tenantId: true,
  classroomId: true,
  date: true,
  takenByUserId: true,
  isClosed: true,
  closedAt: true,
  certifiedAt: true,
  classroom: { select: { name: true } },
} satisfies Prisma.AttendanceSessionSelect;

type SessionRow = Prisma.AttendanceSessionGetPayload<{ select: typeof sessionSelect }>;

function toApiSession(s: SessionRow) {
  const d = isoDateOnly(s.date);
  return {
    id: s.id,
    tenantId: s.tenantId,
    classroomId: s.classroomId,
    classroomName: s.classroom?.name ?? "",
    date: d,
    dateISO: d,
    takenByUserId: s.takenByUserId ?? null,
    isClosed: s.isClosed,
    closedAt: isoOrNull(s.closedAt),
    certifiedAt: isoOrNull(s.certifiedAt),
  };
}

export async function POST(req: Request) {
  try {
    const ctx = await requireTenantContext();
    const safe = { userId: ctx.userId, tenantId: ctx.tenantId };

    const raw = await req.json().catch(() => null);
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) return jsonErr(400, parsed.error.issues[0]?.message || "Invalid request body.");

    const { sessionId, tenantId: tenantIdParam } = parsed.data;

    // legacy compat only
    const suppliedTenantId = tenantIdParam ? String(tenantIdParam).trim() || null : null;
    assertTenantParamMatches(safe.tenantId, suppliedTenantId);

    const membership = await prisma.membership.findFirst({
      where: { tenantId: safe.tenantId, userId: safe.userId, status: "ACTIVE" },
      select: { id: true },
    });
    if (!membership) return jsonErr(403, "Forbidden.");

    const existing = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenantId: safe.tenantId },
      select: sessionSelect,
    });
    if (!existing) return jsonErr(404, "Session not found.");

    await assertCanAccessClassroom({ ...safe, classroomId: existing.classroomId });

    if (!existing.isClosed) return jsonErr(409, "Close session before certifying.");
    if (existing.certifiedAt) return jsonErr(409, "Session already certified.");
    if (existing.takenByUserId && existing.takenByUserId !== safe.userId) {
      return jsonErr(403, "This session is owned by another user.");
    }

    const now = new Date();

    const upd = await prisma.attendanceSession.updateMany({
      where: {
        id: sessionId,
        tenantId: safe.tenantId,
        isClosed: true,
        certifiedAt: null,
        OR: [{ takenByUserId: null }, { takenByUserId: safe.userId }],
      },
      data: { certifiedAt: now, takenByUserId: safe.userId },
    });

    if (upd.count !== 1) return jsonErr(409, "Unable to certify session due to a concurrent update. Retry.");

    const updated = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenantId: safe.tenantId },
      select: sessionSelect,
    });
    if (!updated) return jsonErr(404, "Session not found.");

    return NextResponse.json(
      { ok: true, session: toApiSession(updated) },
      { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
    );
  } catch (e) {
    const { status, msg } = toHttpError(e);
    return jsonErr(status, msg);
  }
}
