// src/app/api/teacher/attendance/sessions/close/route.ts
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
  // Trusted auth context (tenant/user come from server)
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

  // Defense-in-depth for legacy callers
  if (tenantIdParam && tenantIdParam !== safe.tenantId) {
    return jsonErr(403, "Forbidden (tenant mismatch).");
  }

  // Membership gate
  const membership = await prisma.membership.findFirst({
    where: { tenantId: safe.tenantId, userId: safe.userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) return jsonErr(403, "Forbidden.");

  // Read session (tenant-scoped)
  const existing = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: safe.tenantId },
    select: sessionSelect,
  });
  if (!existing) return jsonErr(404, "Session not found.");

  // Certified sessions are immutable
  if (existing.certifiedAt) return jsonErr(409, "Session is certified (immutable).");

  // Prevent silent takeover
  if (existing.takenByUserId && existing.takenByUserId !== safe.userId) {
    return jsonErr(403, "This session is owned by another user.");
  }

  // Idempotent close
  if (existing.isClosed) {
    return NextResponse.json({ ok: true, session: toApiSession(existing) });
  }

  const now = new Date();

  // Concurrency-safe close (only if tenant matches, not certified, and owner is null/same user)
  const upd = await prisma.attendanceSession.updateMany({
    where: {
      id: sessionId,
      tenantId: safe.tenantId,
      certifiedAt: null,
      OR: [{ takenByUserId: null }, { takenByUserId: safe.userId }],
    },
    data: {
      isClosed: true,
      closedAt: now,
      takenByUserId: safe.userId, // claim if null; harmless if already same
    },
  });

  if (upd.count !== 1) {
    // Re-read to classify the race precisely
    const again = await prisma.attendanceSession.findFirst({
      where: { id: sessionId, tenantId: safe.tenantId },
      select: sessionSelect,
    });

    if (!again) return jsonErr(404, "Session not found.");
    if (again.certifiedAt) return jsonErr(409, "Session is certified (immutable).");
    if (again.takenByUserId && again.takenByUserId !== safe.userId) {
      return jsonErr(403, "This session is owned by another user.");
    }
    if (again.isClosed) {
      return NextResponse.json({ ok: true, session: toApiSession(again) });
    }
    return jsonErr(409, "Unable to close session due to a concurrent update. Retry.");
  }

  const updated = await prisma.attendanceSession.findFirst({
    where: { id: sessionId, tenantId: safe.tenantId },
    select: sessionSelect,
  });
  if (!updated) return jsonErr(404, "Session not found.");

  return NextResponse.json({ ok: true, session: toApiSession(updated) });
}
