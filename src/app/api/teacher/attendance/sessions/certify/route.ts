// src/app/api/teacher/attendance/sessions/certify/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireServerUserContext } from "@/lib/serverAuth";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    sessionId: z.string().min(1, "sessionId is required."),
    // legacy: may be sent by older clients; never trust it
    tenantId: z.string().optional(),
  })
  .strict();

function jsonErr(status: number, error: string) {
  return NextResponse.json({ ok: false, error }, { status });
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
  return {
    id: s.id,
    tenantId: s.tenantId,
    classroomId: s.classroomId,
    classroomName: s.classroom?.name ?? "",
    dateISO: isoDateOnly(s.date),
    takenByUserId: s.takenByUserId ?? null,
    isClosed: s.isClosed,
    closedAt: isoOrNull(s.closedAt),
    certifiedAt: isoOrNull(s.certifiedAt),
  };
}

export async function POST(req: Request) {
  let safe: { userId: string; tenantId: string };
  try {
    safe = await requireServerUserContext({ requireTenant: true });
  } catch {
    return jsonErr(401, "Unauthorized.");
  }

  const raw = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message || "Invalid request body.";
    return jsonErr(400, msg);
  }

  const { sessionId, tenantId: tenantIdParam } = parsed.data;

  if (tenantIdParam && tenantIdParam !== safe.tenantId) {
    return jsonErr(403, "Forbidden (tenant mismatch).");
  }

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

  if (!existing.isClosed) return jsonErr(409, "Close session before certifying.");
  if (existing.certifiedAt) return jsonErr(409, "Session already certified.");

  // Prevent silent takeover
  if (existing.takenByUserId && existing.takenByUserId !== safe.userId) {
    return jsonErr(403, "This session is owned by another user.");
  }

  const now = new Date();

  // Concurrency-safe certify
  const upd = await prisma.attendanceSession.updateMany({
    where: {
      id: sessionId,
      tenantId: safe.tenantId,
      isClosed: true,
      certifiedAt: null,
      OR: [{ takenByUserId: null }, { takenByUserId: safe.userId }],
    },
    data: {
      certifiedAt: now,
      takenByUserId: safe.userId, // claim if null / confirm ownership
    },
  });

  if (upd.count !== 1) {
    const again = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenantId: safe.tenantId },
      select: sessionSelect,
    });

    if (!again) return jsonErr(404, "Session not found.");
    if (!again.isClosed) return jsonErr(409, "Close session before certifying.");
    if (again.certifiedAt) return jsonErr(409, "Session already certified.");
    if (again.takenByUserId && again.takenByUserId !== safe.userId) {
      return jsonErr(403, "This session is owned by another user.");
    }

    return jsonErr(409, "Unable to certify session due to a concurrent update. Retry.");
  }

  const updated = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: safe.tenantId },
    select: sessionSelect,
  });
  if (!updated) return jsonErr(404, "Session not found.");

  return NextResponse.json({ ok: true, session: toApiSession(updated) });
}
